// Core authorization/write logic for the session-bound profile write path
// (hotfix/session-bound-forms). Extracted out of app/api/profile/update/route.ts
// so it can be exercised by an automated test against an in-memory fake
// client — the route itself does no HTTP without a live server and a real
// authenticated session, which the "actor calls the route for someone
// else's subject" and "version conflict" scenarios need to be deterministic
// and runnable in CI, not just manually reasoned about.
//
// The route stays a thin NextRequest/NextResponse wrapper around this.

export const WRITABLE_FIELDS = new Set([
  'full_name',
  'artist_name',
  'pro_affiliation',
  'ipi_number',
  'publisher_name',
  'legal_name',
  'bandsintown_artist_name',
  'career_start_year',
  'avatar_url',
])

export type FieldValue = string | number | null

export interface ProfileUpdateRequestBody {
  subjectId?: unknown
  expectedUpdatedAt?: unknown
  fields?: unknown
}

export interface ProfileUpdateResult {
  status: number
  body: Record<string, unknown>
}

// Structural subset of the real Supabase client — narrow enough that both
// the real @supabase/ssr server client and a lightweight in-memory fake
// satisfy it.
export interface ProfileUpdateSupabaseClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string; email?: string | null } | null } }>
  }
  from(table: 'profiles'): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { id: string; updated_at: string } | null; error: { message: string } | null }>
      }
    }
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: Record<string, unknown> | null; error: { code?: string; message: string } | null }>
      }
    }
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: string): {
            maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
          }
        }
      }
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// Per-field validation, not just the broad string|number|null shape check
// above. A field with no meaningful "cleared" state as an empty string
// (every nullable text column here) must be sent as null instead — the
// client already does this via toWirePayload(); this is the server-side
// enforcement of the same rule for a caller that bypasses the client.
type FieldValidator = (value: FieldValue) => string | null

const optionalNonBlankText: FieldValidator = (v) =>
  v === null || isNonEmptyString(v) ? null : 'must be a non-empty string or null (send null to clear, not an empty string)'

const FIELD_VALIDATORS: Record<string, FieldValidator> = {
  // full_name is the one product-required field (Settings marks it with a
  // required asterisk) — never null, never blank.
  full_name: (v) => (isNonEmptyString(v) ? null : 'is required and cannot be blank'),
  artist_name: optionalNonBlankText,
  pro_affiliation: optionalNonBlankText,
  ipi_number: optionalNonBlankText,
  publisher_name: optionalNonBlankText,
  legal_name: optionalNonBlankText,
  bandsintown_artist_name: optionalNonBlankText,
  avatar_url: optionalNonBlankText,
  career_start_year: (v) => {
    if (v === null) return null
    if (typeof v !== 'number' || !Number.isInteger(v)) return 'must be an integer'
    const currentYear = new Date().getFullYear()
    if (v < 1900 || v > currentYear) return `must be between 1900 and ${currentYear}`
    return null
  },
}

export type ProfileWriteLogEvent = {
  event: 'profile_write'
  actor_id: string
  subject_id: string
  changed_fields: string[]
  at: string
}

export function handleProfileUpdate(
  supabase: ProfileUpdateSupabaseClient,
  body: unknown,
  log: (entry: ProfileWriteLogEvent) => void = (entry) => console.log(JSON.stringify(entry)),
): Promise<ProfileUpdateResult> {
  return (async () => {
    if (!isPlainObject(body)) {
      return { status: 400, body: { error: 'Invalid request body' } }
    }

    const { subjectId, expectedUpdatedAt, fields } = body as ProfileUpdateRequestBody

    if (typeof subjectId !== 'string' || !UUID_RE.test(subjectId)) {
      return { status: 400, body: { error: 'subjectId must be a valid UUID' } }
    }
    if (!isPlainObject(fields)) {
      return { status: 400, body: { error: 'fields required' } }
    }

    const fieldEntries = Object.entries(fields)
    if (fieldEntries.length === 0) {
      return { status: 400, body: { error: 'Empty patch — nothing to save' } }
    }

    const patch: Record<string, FieldValue> = {}
    for (const [key, value] of fieldEntries) {
      if (!WRITABLE_FIELDS.has(key)) {
        return { status: 400, body: { error: `Field not writable: ${key}` } }
      }
      if (value !== null && typeof value !== 'string' && typeof value !== 'number') {
        return { status: 400, body: { error: `Invalid value for field: ${key}` } }
      }
      const validationError = FIELD_VALIDATORS[key]?.(value as FieldValue) ?? null
      if (validationError) {
        return { status: 400, body: { error: `Invalid value for field ${key}: ${validationError}` } }
      }
      patch[key] = value as FieldValue
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { status: 401, body: { error: 'Unauthorized' } }
    }

    if (user.id !== subjectId) {
      return { status: 403, body: { error: 'Subject does not match the authenticated account' } }
    }

    patch.updated_at = new Date().toISOString()

    const { data: existing, error: existingError } = await supabase
      .from('profiles')
      .select('id, updated_at')
      .eq('id', subjectId)
      .maybeSingle()

    if (existingError) {
      return { status: 500, body: { error: 'Failed to load current profile state' } }
    }

    if (!existing) {
      const { data: inserted, error: insertError } = await supabase
        .from('profiles')
        .insert({ id: subjectId, email: user.email ?? '', ...patch })
        .select('id, updated_at, ' + Array.from(WRITABLE_FIELDS).join(', '))
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          return { status: 409, body: { error: 'version_conflict', message: 'Profile was created concurrently — reload and try again.' } }
        }
        return { status: 500, body: { error: 'Failed to create profile' } }
      }

      log({ event: 'profile_write', actor_id: user.id, subject_id: subjectId, changed_fields: Object.keys(fields as object), at: new Date().toISOString() })
      return { status: 200, body: { profile: inserted } }
    }

    if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt) {
      return { status: 400, body: { error: 'expectedUpdatedAt required for an existing profile' } }
    }
    if (new Date(expectedUpdatedAt).getTime() !== new Date(existing.updated_at).getTime()) {
      return { status: 409, body: { error: 'version_conflict', current_updated_at: existing.updated_at } }
    }

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', subjectId)
      .eq('updated_at', existing.updated_at)
      .select('id, updated_at, ' + Array.from(WRITABLE_FIELDS).join(', '))
      .maybeSingle()

    if (updateError) {
      return { status: 500, body: { error: 'Failed to save' } }
    }
    if (!updated) {
      return { status: 409, body: { error: 'version_conflict' } }
    }

    log({ event: 'profile_write', actor_id: user.id, subject_id: subjectId, changed_fields: Object.keys(fields as object), at: new Date().toISOString() })
    return { status: 200, body: { profile: updated } }
  })()
}
