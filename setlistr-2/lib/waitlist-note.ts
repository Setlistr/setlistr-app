// Access requests: the artist/project name and a website or social link
// travel in the waitlist row's existing `note` column (no schema change),
// as labelled first lines, followed by anything else the applicant wrote.
// Composed by app/api/waitlist (server side, after validation) and read back
// by Admin to show them as fields. Rows written before this keep their
// plain note and simply have no project or link.

export const NOTE_MAX_LENGTH = 500
export const PROJECT_MAX_LENGTH = 120
export const LINK_MAX_LENGTH = 200

const PROJECT_LABEL = 'Artist or project: '
const LINK_LABEL = 'Link: '

const oneLine = (v: unknown) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''

export function cleanProject(v: unknown): { value: string | null; error?: string } {
  const s = oneLine(v)
  if (!s) return { value: null }
  if (s.length > PROJECT_MAX_LENGTH) return { value: null, error: `Keep the artist or project name under ${PROJECT_MAX_LENGTH} characters.` }
  return { value: s }
}

// A website (with or without https://) or a social handle (@name). Only
// checked for shape; nothing is fetched.
export function cleanLink(v: unknown): { value: string | null; error?: string } {
  const s = oneLine(v)
  if (!s) return { value: null }
  const bad = { value: null, error: 'Enter a website or social link, for example https://yourband.com or @yourname.' }
  if (s.length > LINK_MAX_LENGTH || /\s/.test(s)) return bad
  if (/^@[A-Za-z0-9._-]{1,60}$/.test(s)) return { value: s }
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (!/^https?:$/.test(u.protocol) || !/^[^.\s]+(\.[^.\s]+)+$/.test(u.hostname)) return bad
    return { value: s }
  } catch { return bad }
}

export function composeNote(parts: { project: string | null; link: string | null; note: string | null }): string | null {
  const head = [parts.project ? PROJECT_LABEL + parts.project : null, parts.link ? LINK_LABEL + parts.link : null].filter(Boolean).join('\n')
  const rest = (parts.note || '').trim()
  if (!head) return rest ? rest.slice(0, NOTE_MAX_LENGTH) : null
  const room = NOTE_MAX_LENGTH - head.length - 1
  return rest && room > 0 ? `${head}\n${rest.slice(0, room)}` : head
}

export function parseNote(note: string | null | undefined): { project: string | null; link: string | null; rest: string | null } {
  if (!note) return { project: null, link: null, rest: null }
  const lines = note.split('\n')
  let project: string | null = null, link: string | null = null, i = 0
  if (lines[i]?.startsWith(PROJECT_LABEL)) { project = lines[i].slice(PROJECT_LABEL.length); i++ }
  if (lines[i]?.startsWith(LINK_LABEL)) { link = lines[i].slice(LINK_LABEL.length); i++ }
  const rest = lines.slice(i).join('\n').trim()
  return { project, link, rest: rest || null }
}

// A link Admin can open: a handle stays text, a bare domain gets https://.
export function linkHref(link: string): string | null {
  if (link.startsWith('@')) return null
  return /^https?:\/\//i.test(link) ? link : `https://${link}`
}
