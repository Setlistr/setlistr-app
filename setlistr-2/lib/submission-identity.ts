// Whether the artist's private identity fields (legal name, IPI) are
// missing from a submission claim sheet — app/app/submit/[id]/page.tsx
// uses this for two distinct notices from the SAME underlying check:
//   - the owner: their own account is missing these, go fill them in.
//   - a delegate: these are never visible to them at all (the existing
//     privacy boundary — see that page's load()), so their claim sheet
//     omits them regardless of what the artist's real values are.
// Extracted here (not inline in the page) so a test can call this exact
// function rather than a re-typed copy of its logic.

export interface IdentityProfileFields {
  legal_name?: string | null
  ipi_number?: string | null
}

// null, undefined, and a blank/whitespace-only string are all treated as
// "missing" — a field that's technically a non-null empty string is still
// nothing usable on a claim sheet.
function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0
}

export function missingIdentityFields(profile: IdentityProfileFields | null): string[] {
  return [
    isBlank(profile?.legal_name) && 'legal name',
    isBlank(profile?.ipi_number) && 'IPI number',
  ].filter((x): x is string => !!x)
}
