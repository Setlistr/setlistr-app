export type WaitlistSubmission = {
  email: string
  name: string
  note: string | null
  roles: string[]
  pro: string | null
}

// Both waitlist write sites (WaitlistForm.tsx, auth/login's Request Access
// panel) call this so the dedup/merge behavior can't drift between them
// again — that drift is what produced duplicate rows for the same person
// (e.g. Vilaralte34@gmail.com vs. vilaralte34@gmail.com) before this existed.
// The actual dedup/merge runs server-side (app/api/waitlist/route.ts) behind
// the service role — waitlist's RLS is INSERT-only, so the browser can't do
// the SELECT-then-UPDATE-or-INSERT itself.
export async function submitWaitlistEntry(
  submission: WaitlistSubmission
): Promise<{ error: { code?: string; message: string } | null }> {
  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    })
    const data = await res.json()
    if (!res.ok) {
      return { error: { code: data.code, message: data.error || 'Something went wrong.' } }
    }
    return { error: null }
  } catch {
    return { error: { message: 'Network error — try again' } }
  }
}
