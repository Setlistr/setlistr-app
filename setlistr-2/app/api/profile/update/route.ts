import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { handleProfileUpdate, type ProfileUpdateSupabaseClient } from '@/lib/profileUpdateHandler'

// ─── Session-bound profile writes ──────────────────────────────────────────
// Hotfix for a proven cross-account corruption class: a Settings/Onboarding
// form loaded under one authenticated identity, left mounted while the
// browser's session changed to a different account, then saved — writing
// the FIRST identity's stale, unedited field values into the SECOND
// identity's row (both fields resolved independently, load-time vs.
// save-time, with nothing in between reconciling them). This route is the
// single write path both pages now go through, and it closes that gap by
// construction rather than by client discipline alone — see
// lib/profileUpdateHandler.ts for the actual authorization/write logic
// (kept separate from this Next.js glue so it's testable against an
// in-memory fake client without a live server or a real session):
//   - the actor is derived from the request's own session, server-side,
//     never trusted from the client;
//   - the subject must be explicitly named and must equal the actor (no
//     delegation/managed-workspace editing here — that's a separate,
//     unbuilt project, deliberately out of scope for this hotfix);
//   - only an explicit allowlist of fields may ever be written, and the
//     request body is never spread into the update — an unknown key is a
//     hard rejection, not a silently-ignored extra;
//   - an empty patch is rejected outright, so a save can never fire with
//     nothing the user actually changed;
//   - optimistic concurrency via `updated_at`: the caller must supply the
//     version it loaded, and the write only applies if that still matches
//     the row's current version, closing the window where a stale-but-
//     structurally-valid payload could silently clobber a newer write from
//     another tab/card/session.
//
// Uses the cookie-scoped, RLS-respecting server client — the same one
// every other authenticated route in this app already uses — not the
// service-role client. RLS's own `profiles_self` policy
// (`auth.uid() = id`) already guarantees a user can only ever affect their
// own row; the actor===subject check is a second, explicit gate on top of
// that, not a substitute for it, so the 403 this route returns for a
// mismatched subject is never the only thing standing between a caller
// and someone else's row.

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  // The real Supabase client's generic surface is far wider (and its
  // types far deeper) than the narrow shape handleProfileUpdate actually
  // calls — checking structural assignability against it directly blows
  // up the type checker (excessively deep instantiation) rather than
  // failing meaningfully. This cast is a boundary adapter, not a trust
  // escape: handleProfileUpdate never touches anything on the client
  // outside the methods ProfileUpdateSupabaseClient declares, and those
  // calls behave identically on the real client and the test harness's
  // in-memory fake.
  const result = await handleProfileUpdate(supabase as unknown as ProfileUpdateSupabaseClient, body)
  return NextResponse.json(result.body, { status: result.status })
}
