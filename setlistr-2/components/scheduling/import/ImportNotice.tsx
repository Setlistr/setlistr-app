'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { textAction } from '@/components/ui/controls'

// After an import, one quiet line on Schedule (docs/spreadsheet-import-plan.md).
// The result itself (rows left out, Undo) lives on its own page, so it can be
// reopened after this line is gone: from here, from Import shows → Recent
// imports, and from any imported show's details.
export function ImportNotice({ importId }: { importId: string }) {
  const [r, setR] = useState<{ file: string; shows: number; leftOut: number } | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/api/shows/import/${importId}`, { cache: 'no-store' })
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (live && d) setR({ file: d.file, shows: d.shows.length, leftOut: d.leftOut.length }) })
      .catch(() => {})
    return () => { live = false }
  }, [importId])
  if (!r) return null
  return (
    <div className="tl-err" role="status" style={{ marginBottom: 14 }}>
      <span><b style={{ color: 'var(--sl-text)' }}>{r.shows} {r.shows === 1 ? 'show' : 'shows'} imported</b> from {r.file}.{r.leftOut ? ` ${r.leftOut} ${r.leftOut === 1 ? 'row was' : 'rows were'} left out.` : ''}</span>
      <Link href={`/app/schedule/import/${importId}`} style={textAction}>View import</Link>
    </div>
  )
}
