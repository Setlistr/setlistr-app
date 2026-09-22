// Deterministic, dependency-free tests for hotfix/session-bound-forms.
// No live server, no real Supabase project, no network — pure functions
// (diffFields, toWirePayload, evaluateAuthEvent) called directly, and the
// server write path (handleProfileUpdate) exercised against a small
// in-memory fake standing in for the Supabase client. This repo has no
// test framework configured (see CLAUDE.md), so this follows the existing
// scripts/ convention (see reconcile.ts): a ts-node CLI harness with its
// own assertions, run via:
//
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-session-bound-forms.ts
//
// Each numbered test corresponds to a scenario from the hotfix task's
// TESTS section / the review's Phase 3 list.

import { diffFields, toWirePayload } from '../lib/profileFormDiff'
import { evaluateAuthEvent } from '../lib/sessionGuardLogic'
import {
  handleProfileUpdate,
  WRITABLE_FIELDS,
  type ProfileUpdateSupabaseClient,
  type ProfileWriteLogEvent,
} from '../lib/profileUpdateHandler'

// ─── tiny assertion harness ────────────────────────────────────────────────
let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
  }
}
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ─── fake Supabase client for handleProfileUpdate ──────────────────────────
interface FakeRow { id: string; updated_at: string; [k: string]: unknown }

class FakeProfilesTable {
  rows = new Map<string, FakeRow>()
  // When set (including to null), select().maybeSingle() returns this
  // fixed result instead of consulting `rows` — used to simulate a stale
  // read racing with a concurrent insert (test 11), or a row that moves
  // between the version check and the actual UPDATE call (test: CAS
  // zero-row result).
  forceSelectResult?: FakeRow | null | undefined
  private forceSelectSet = false
  // When set, the UPDATE call's CAS predicate always misses (simulating
  // the row having moved between the pre-check SELECT and the UPDATE
  // itself), regardless of what the fake table's rows actually contain.
  forceUpdateMiss = false

  seed(row: FakeRow) { this.rows.set(row.id, { ...row }) }
  setForcedSelect(row: FakeRow | null) { this.forceSelectResult = row; this.forceSelectSet = true }
  hasForcedSelect() { return this.forceSelectSet }
}

function makeFakeClient(
  actor: { id: string; email?: string } | null,
  table: FakeProfilesTable,
): ProfileUpdateSupabaseClient {
  return {
    auth: {
      async getUser() { return { data: { user: actor } } },
    },
    from(_table: 'profiles') {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, id: string) {
              return {
                async maybeSingle() {
                  if (table.hasForcedSelect()) {
                    const row = table.forceSelectResult
                    return { data: row ? { id: row.id, updated_at: row.updated_at } : null, error: null }
                  }
                  const row = table.rows.get(id)
                  return { data: row ? { id: row.id, updated_at: row.updated_at } : null, error: null }
                },
              }
            },
          }
        },
        insert(row: Record<string, unknown>) {
          return {
            select(_cols: string) {
              return {
                async single() {
                  const id = row.id as string
                  if (table.rows.has(id)) {
                    return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
                  }
                  const newRow: FakeRow = { ...row, id, updated_at: (row.updated_at as string) ?? new Date().toISOString() } as FakeRow
                  table.rows.set(id, newRow)
                  return { data: { ...newRow }, error: null }
                },
              }
            },
          }
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col1: string, id: string) {
              return {
                eq(_col2: string, expectedUpdatedAt: string) {
                  return {
                    select(_cols: string) {
                      return {
                        async maybeSingle() {
                          if (table.forceUpdateMiss) {
                            return { data: null, error: null }
                          }
                          const row = table.rows.get(id)
                          if (!row || row.updated_at !== expectedUpdatedAt) {
                            return { data: null, error: null }
                          }
                          const updated: FakeRow = { ...row, ...patch }
                          table.rows.set(id, updated)
                          return { data: { ...updated }, error: null }
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

async function main() {
  const A = '11111111-1111-4111-8111-111111111111'
  const B = '22222222-2222-4222-8222-222222222222'

  // ── 1. Load as A, save as A → allowed ─────────────────────────────────
  console.log('1. Load as A, save as A → allowed')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z', full_name: 'Old Name' })
    const client = makeFakeClient({ id: A, email: 'a@example.com' }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { full_name: 'New Name' },
    })
    check('returns 200', result.status === 200, `got ${result.status} ${JSON.stringify(result.body)}`)
    check('applies the write', (result.body as any).profile?.full_name === 'New Name')
  }

  // ── 2a. evaluateAuthEvent: null → A → B sequence → invalid ─────────────
  console.log('2a. loadedViewerId starts null, resolves to A, then auth flips to B → invalid')
  {
    // Mirrors what useSessionGuard actually does across renders: while
    // loadedViewerId is still null (profile load in flight), any event is
    // a no-op (the hook's effect doesn't even subscribe yet — see 2c).
    // Once bound to A, an event resolving to B must invalidate.
    const whileUnbound = evaluateAuthEvent('SIGNED_IN', B, null)
    check('no-op while loadedViewerId is still null', whileUnbound === null, JSON.stringify(whileUnbound))
    const afterBoundToA = evaluateAuthEvent('SIGNED_IN', B, A)
    check('invalidates once bound to A and B appears', deepEqual(afterBoundToA, { invalid: true, reason: 'account_changed' }), JSON.stringify(afterBoundToA))
  }

  // ── 2b. Load as A, current session becomes B → rejected client-side ───
  console.log('2b. Load as A, current session becomes B (SIGNED_IN) → rejected client-side')
  {
    const state = evaluateAuthEvent('SIGNED_IN', B, A)
    check('evaluateAuthEvent flags account_changed', deepEqual(state, { invalid: true, reason: 'account_changed' }), JSON.stringify(state))
  }

  // ── 2c. INITIAL_SESSION carrying a different user id → invalid ─────────
  console.log('2c. INITIAL_SESSION (not just SIGNED_IN) resolving to a different user → invalid')
  {
    const state = evaluateAuthEvent('INITIAL_SESSION', B, A)
    check('INITIAL_SESSION with a different id invalidates too', deepEqual(state, { invalid: true, reason: 'account_changed' }), JSON.stringify(state))
    // And the converse: INITIAL_SESSION for the SAME id is a no-op.
    const same = evaluateAuthEvent('INITIAL_SESSION', A, A)
    check('INITIAL_SESSION for the same id is a no-op', same === null, JSON.stringify(same))
  }

  // ── 3. B bypasses client and calls route for subject A → rejected ─────
  console.log('3. B bypasses client and calls route for subject A → rejected server-side')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z', full_name: 'A Real Name' })
    const client = makeFakeClient({ id: B, email: 'b@example.com' }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { full_name: 'Overwritten By B' },
    })
    check('returns 403', result.status === 403, `got ${result.status}`)
    check('row A is untouched', table.rows.get(A)?.full_name === 'A Real Name')
  }

  // ── 4. Load as A, row updated elsewhere → 409 (stale expectedUpdatedAt) ─
  console.log('4. Load as A, row updated elsewhere → 409 (version mismatch at the pre-check)')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-02T00:00:00.000Z', full_name: 'Newer Name' }) // moved since A's load
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z', // stale, from A's original load
      fields: { full_name: 'Stale Edit' },
    })
    check('returns 409', result.status === 409, `got ${result.status}`)
    check('error is version_conflict', (result.body as any).error === 'version_conflict')
    check('row is untouched', table.rows.get(A)?.full_name === 'Newer Name')
  }

  // ── 4b. Compare-and-swap zero-row result → 409 ─────────────────────────
  // Distinct from test 4: the pre-check SELECT sees a version that still
  // matches expectedUpdatedAt, but the row moves in the gap between that
  // check and the actual UPDATE's own CAS predicate — the UPDATE's
  // .eq('updated_at', ...) then matches zero rows, and that must ALSO be
  // reported as a conflict, not silently treated as a no-op success.
  console.log('4b. Compare-and-swap zero-row result on UPDATE itself → 409')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z', full_name: 'Pre-Race Name' })
    table.forceUpdateMiss = true
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z', // matches at pre-check time
      fields: { full_name: 'Raced Out Edit' },
    })
    check('returns 409', result.status === 409, `got ${result.status} ${JSON.stringify(result.body)}`)
    check('error is version_conflict', (result.body as any).error === 'version_conflict')
    check('row is untouched by the losing write', table.rows.get(A)?.full_name === 'Pre-Race Name')
  }

  // ── 5. Change only PRO → payload contains only pro_affiliation ────────
  console.log('5. Change only PRO → payload contains only pro_affiliation')
  {
    const loaded = { full_name: 'A', artist_name: 'A', pro_affiliation: '', ipi_number: '00000', publisher_name: 'Pub', legal_name: 'Legal A' }
    const patch = diffFields(loaded, { pro_affiliation: 'ASCAP' })
    check('patch is exactly {pro_affiliation}', deepEqual(patch, { pro_affiliation: 'ASCAP' }), JSON.stringify(patch))
  }

  // ── 6. Clear publisher → payload contains publisher_name: null ────────
  console.log('6. Clear publisher → payload contains publisher_name: null')
  {
    const loaded = { publisher_name: 'Sony Music Publishing' }
    const patch = diffFields(loaded, { publisher_name: '' })
    const wire = toWirePayload(patch, new Set<'publisher_name'>(['publisher_name']))
    check('wire payload is exactly {publisher_name: null}', deepEqual(wire, { publisher_name: null }), JSON.stringify(wire))
  }

  // ── 7. Hydration creates no dirty fields ───────────────────────────────
  console.log('7. Hydration creates no dirty fields')
  {
    const loaded = { full_name: 'A', artist_name: 'A Band', pro_affiliation: 'SOCAN', ipi_number: '123', publisher_name: '', legal_name: 'A Legal', bandsintown_artist_name: 'A Band', career_start_year: 2015 as number | '' }
    // Hydration sets "current" form state to exactly the loaded snapshot —
    // diffing a snapshot against itself must be empty.
    const patch = diffFields(loaded, { ...loaded })
    check('diff of loaded-against-itself is empty', deepEqual(patch, {}), JSON.stringify(patch))
  }

  // ── 8. Token refresh for A → form remains valid ────────────────────────
  console.log('8. Token refresh for A → form remains valid')
  {
    const state = evaluateAuthEvent('TOKEN_REFRESHED', A, A)
    check('evaluateAuthEvent returns null (no change)', state === null, JSON.stringify(state))
  }

  // ── 9. Sign-out → form invalidated ─────────────────────────────────────
  console.log('9. Sign-out → form invalidated')
  {
    const state = evaluateAuthEvent('SIGNED_OUT', null, A)
    check('evaluateAuthEvent flags signed_out', deepEqual(state, { invalid: true, reason: 'signed_out' }), JSON.stringify(state))
  }

  // ── 10. Onboarding loaded as A cannot write to B ───────────────────────
  console.log('10. Onboarding loaded as A cannot write to B (fresh profile, no existing row)')
  {
    const table = new FakeProfilesTable() // no row for A — fresh onboarding
    const client = makeFakeClient({ id: B }, table) // but the session is now B
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      fields: { full_name: 'Someone', artist_name: 'Some Band', pro_affiliation: null },
    })
    check('returns 403 (never reaches the insert)', result.status === 403, `got ${result.status}`)
    check('no row was created for A', !table.rows.has(A))
  }

  // ── 11. Concurrent onboarding creation does not overwrite ─────────────
  console.log('11. Concurrent onboarding creation does not overwrite')
  {
    const table = new FakeProfilesTable()
    // Simulate the race window: this request's SELECT ran before the
    // concurrent request's INSERT landed, so it (correctly, for that
    // moment) saw no row — but by the time THIS request's own INSERT
    // executes, the row already exists.
    table.setForcedSelect(null)
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z', full_name: 'Winner Of The Race' })
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      fields: { full_name: 'Loser Of The Race' },
    })
    check('returns 409, not a silent overwrite', result.status === 409, `got ${result.status} ${JSON.stringify(result.body)}`)
    check('the concurrently-created row is untouched', table.rows.get(A)?.full_name === 'Winner Of The Race')
  }

  // ── 12. Server logging excludes values and sensitive identifiers ──────
  console.log('12. Server logging excludes values and sensitive identifiers')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z' })
    const client = makeFakeClient({ id: A, email: 'jesse.sensitive@example.com' }, table)
    let captured: ProfileWriteLogEvent | null = null
    await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { legal_name: 'Jesse Realname', ipi_number: '00378495217', publisher_name: 'Secret Publishing Co' },
    }, (entry) => { captured = entry })

    check('a log entry was emitted', captured !== null)
    if (captured) {
      const c: ProfileWriteLogEvent = captured
      check('log has exactly the expected keys', deepEqual(Object.keys(c).sort(), ['actor_id', 'at', 'changed_fields', 'event', 'subject_id'].sort()), Object.keys(c).join(','))
      check('changed_fields is field NAMES only', deepEqual([...c.changed_fields].sort(), ['ipi_number', 'legal_name', 'publisher_name'].sort()))
      const serialized = JSON.stringify(c)
      check('log does not contain the legal name value', !serialized.includes('Jesse Realname'))
      check('log does not contain the IPI value', !serialized.includes('00378495217'))
      check('log does not contain the publisher value', !serialized.includes('Secret Publishing Co'))
      check('log does not contain the actor email', !serialized.includes('jesse.sensitive@example.com'))
    }
  }

  // ── 13. Unknown field is rejected, not silently dropped or spread ─────
  console.log('13. Unknown field rejected')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z' })
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { role: 'admin' }, // not in WRITABLE_FIELDS
    })
    check('returns 400', result.status === 400, `got ${result.status}`)
    check('role is confirmed not writable', !WRITABLE_FIELDS.has('role'))
  }

  // ── 14. Wrong value type is rejected ───────────────────────────────────
  console.log('14. Wrong value type rejected (career_start_year as a string)')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z' })
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A,
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { career_start_year: '2015' }, // should be a number, not a string
    })
    check('returns 400', result.status === 400, `got ${result.status} ${JSON.stringify(result.body)}`)
  }

  // ── 15. Invalid career_start_year is rejected (range/integer) ─────────
  console.log('15. Invalid career_start_year rejected')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z' })
    const client = makeFakeClient({ id: A }, table)

    const tooEarly = await handleProfileUpdate(client, {
      subjectId: A, expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { career_start_year: 1899 },
    })
    check('year before 1900 is rejected', tooEarly.status === 400, `got ${tooEarly.status}`)

    const futureYear = await handleProfileUpdate(client, {
      subjectId: A, expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { career_start_year: new Date().getFullYear() + 1 },
    })
    check('year in the future is rejected', futureYear.status === 400, `got ${futureYear.status}`)

    const nonInteger = await handleProfileUpdate(client, {
      subjectId: A, expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { career_start_year: 2015.5 },
    })
    check('non-integer year is rejected', nonInteger.status === 400, `got ${nonInteger.status}`)
  }

  // ── 16. Blank full_name is rejected (required field, server-side) ─────
  console.log('16. Blank full_name rejected server-side, not just client-side')
  {
    const table = new FakeProfilesTable()
    table.seed({ id: A, updated_at: '2026-01-01T00:00:00.000Z', full_name: 'Keep Me' })
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: A, expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
      fields: { full_name: '   ' },
    })
    check('returns 400', result.status === 400, `got ${result.status}`)
    check('row is untouched', table.rows.get(A)?.full_name === 'Keep Me')
  }

  // ── 17. Malformed subjectId (not a UUID) is rejected ───────────────────
  console.log('17. Malformed subjectId rejected')
  {
    const table = new FakeProfilesTable()
    const client = makeFakeClient({ id: A }, table)
    const result = await handleProfileUpdate(client, {
      subjectId: 'not-a-uuid',
      fields: { full_name: 'X' },
    })
    check('returns 400', result.status === 400, `got ${result.status}`)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch(err => { console.error(err); process.exit(1) })
