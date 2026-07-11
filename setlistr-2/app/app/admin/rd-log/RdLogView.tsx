'use client'
import { useState, useMemo } from 'react'

const C = {
  bg:         '#0a0908',
  card:       '#141210',
  card2:      '#1a1814',
  border:     'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)',
  text:       '#f0ece3',
  secondary:  '#a09070',
  muted:      '#6a6050',
  gold:       '#c9a84c',
  goldDim:    'rgba(201,168,76,0.1)',
  green:      '#4ade80',
  red:        '#f87171',
  amber:      '#f59e0b',
}

const MEMBERS = ['Jesse', 'Daryl', 'Spencer', 'Kode']
const ROLES: Record<string, string> = {
  Jesse:   'Founder / Lead Dev',
  Daryl:   'Songwriter / Developer',
  Spencer: 'iOS Engineer',
  Kode:    'Engineer',
}
const FUNDING_OPTIONS = ['Section 41', 'IRAP', 'NSF SBIR', 'Patent'] as const

type RdEntry = {
  id:                    string
  entry_date:            string
  team_member:           string
  role:                  string
  workstream:            string
  technical_problem:     string | null
  hypothesis:            string | null
  work_performed:        string | null
  hours:                 number | null
  outcome:               string | null
  remaining_uncertainty: string | null
  related_file:          string | null
  evidence_link:         string | null
  funding_relevance:     string[] | null
  is_retroactive:        boolean
  notes:                 string | null
  created_at:            string
}

type Structured = {
  workstream:            string
  technical_problem:     string
  hypothesis:            string
  work_performed:        string
  outcome:               string
  remaining_uncertainty: string
  related_file:          string
  funding_relevance:     string[]
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function FundingTag({ label }: { label: string }) {
  const colors: Record<string, string> = {
    'Section 41': 'rgba(201,168,76,0.15)',
    'IRAP':       'rgba(74,222,128,0.1)',
    'NSF SBIR':   'rgba(96,165,250,0.1)',
    'Patent':     'rgba(167,139,250,0.1)',
  }
  const textColors: Record<string, string> = {
    'Section 41': C.gold,
    'IRAP':       C.green,
    'NSF SBIR':   '#60a5fa',
    'Patent':     '#a78bfa',
  }
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      padding: '2px 7px', borderRadius: 4,
      background: colors[label] || C.goldDim,
      color: textColors[label] || C.gold,
    }}>
      {label}
    </span>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 4px',
      }}>{label}</p>
      <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>{value}</p>
    </div>
  )
}

export default function RdLogView({ initialEntries }: { initialEntries: RdEntry[] }) {
  // ── Form state ───────────────────────────────────────────────────────────────
  const [member,      setMember]      = useState('Jesse')
  const [description, setDescription] = useState('')
  const [hours,       setHours]       = useState('')
  const [evidence,    setEvidence]    = useState('')
  const [entryDate,   setEntryDate]   = useState(today())

  // ── AI state ─────────────────────────────────────────────────────────────────
  const [structuring,   setStructuring]   = useState(false)
  const [structured,    setStructured]    = useState<Structured | null>(null)
  const [structureErr,  setStructureErr]  = useState('')

  // ── Save state ───────────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  // ── Table state ──────────────────────────────────────────────────────────────
  const [entries,    setEntries]    = useState<RdEntry[]>(initialEntries)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Hours summary ────────────────────────────────────────────────────────────
  const hoursByMember = useMemo(() => {
    const map: Record<string, number> = {}
    entries.forEach(e => {
      if (e.hours) map[e.team_member] = (map[e.team_member] || 0) + Number(e.hours)
    })
    return map
  }, [entries])

  const totalHours = useMemo(
    () => Object.values(hoursByMember).reduce((s, h) => s + h, 0),
    [hoursByMember]
  )

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleStructure() {
    if (!description.trim()) return
    setStructuring(true)
    setStructureErr('')
    setStructured(null)
    try {
      const res = await fetch('/api/rd-log/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, member, hours, evidence }),
      })
      const data = await res.json()
      if (!res.ok) { setStructureErr(data.error || 'Structuring failed'); return }
      setStructured(data.structured)
    } catch {
      setStructureErr('Network error — try again')
    } finally {
      setStructuring(false)
    }
  }

  async function handleSave() {
    if (!structured) return
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/rd-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_date:            entryDate,
          team_member:           member,
          role:                  ROLES[member] || 'Engineer',
          workstream:            structured.workstream,
          technical_problem:     structured.technical_problem   || null,
          hypothesis:            structured.hypothesis          || null,
          work_performed:        structured.work_performed      || null,
          hours:                 hours ? parseFloat(hours) : null,
          outcome:               structured.outcome             || null,
          remaining_uncertainty: structured.remaining_uncertainty || null,
          related_file:          structured.related_file        || null,
          evidence_link:         evidence                       || null,
          funding_relevance:     structured.funding_relevance?.length
                                   ? structured.funding_relevance : null,
          is_retroactive:        false,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setSaveMsg('✗ ' + (data.error || 'Save failed')); return }

      setEntries(prev => [data.entry, ...prev])
      setDescription('')
      setHours('')
      setEvidence('')
      setStructured(null)
      setEntryDate(today())
      setSaveMsg('✓ Entry saved')
      setTimeout(() => setSaveMsg(''), 3000)
    } catch {
      setSaveMsg('✗ Network error — try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/rd-log?export=csv')
      if (!res.ok) return
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'setlistr-rd-log.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      color: C.text,
    }}>
      <div style={{ padding: '28px 20px 60px', maxWidth: 800, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <a href="/app/admin" style={{
            fontSize: 11, color: C.muted, textDecoration: 'none',
            letterSpacing: '0.06em', display: 'inline-block', marginBottom: 16,
          }}>
            ← Admin
          </a>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.25em',
            textTransform: 'uppercase', color: C.gold + '99', margin: '0 0 4px',
          }}>
            Setlistr · Admin
          </p>
          <h1 style={{
            fontSize: 28, fontWeight: 800, color: C.text,
            margin: 0, letterSpacing: '-0.025em',
          }}>
            R&D Activity Log
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '6px 0 0' }}>
            Section 41 · IRAP · NSF SBIR · Patent documentation
          </p>
        </div>

        {/* ── SECTION 1: Log new entry ─────────────────────────────────────── */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '20px', marginBottom: 24,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: C.muted, margin: '0 0 16px',
          }}>
            Log New Entry
          </p>

          {/* Member selector */}
          <div style={{ marginBottom: 14 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.muted, margin: '0 0 8px',
            }}>Team Member</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              {MEMBERS.map(m => (
                <button key={m} onClick={() => setMember(m)} style={{
                  padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                  background:   member === m ? C.gold    : 'rgba(255,255,255,0.04)',
                  border:       member === m ? 'none'    : `1px solid ${C.border}`,
                  color:        member === m ? '#0a0908' : C.muted,
                  transition:   'all 0.15s ease',
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Hours row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
              }}>Date</p>
              <input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box' as const,
                  background: C.card2, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '10px 12px',
                  color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
            <div>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
              }}>Hours</p>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="e.g. 4.5"
                style={{
                  width: '100%', boxSizing: 'border-box' as const,
                  background: C.card2, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '10px 12px',
                  color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Evidence link */}
          <div style={{ marginBottom: 14 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
            }}>Evidence Link (commit URL, PR, doc)</p>
            <input
              type="text"
              value={evidence}
              onChange={e => setEvidence(e.target.value)}
              placeholder="https://github.com/..."
              style={{
                width: '100%', boxSizing: 'border-box' as const,
                background: C.card2, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '10px 12px',
                color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>

          {/* Description textarea */}
          <div style={{ marginBottom: 14 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
            }}>What did you work on?</p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the work casually — what problem were you solving, what did you build or investigate, what did you find out? The AI will structure it into a formal R&D entry."
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box' as const,
                background: C.card2, border: `1px solid ${description ? C.borderGold : C.border}`,
                borderRadius: 8, padding: '12px',
                color: C.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                resize: 'vertical' as const, lineHeight: 1.7,
                transition: 'border-color 0.15s ease',
              }}
            />
          </div>

          {/* Structure button */}
          <button
            onClick={handleStructure}
            disabled={structuring || !description.trim()}
            style={{
              width: '100%', padding: '13px',
              background: description.trim() ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${description.trim() ? C.borderGold : C.border}`,
              borderRadius: 10, cursor: description.trim() ? 'pointer' : 'default',
              color: description.trim() ? C.gold : C.muted,
              fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
              fontFamily: 'inherit', transition: 'all 0.15s ease',
              opacity: structuring ? 0.6 : 1,
            }}
          >
            {structuring ? 'Structuring with AI…' : '✦ Structure with AI'}
          </button>

          {structureErr && (
            <p style={{ fontSize: 12, color: C.red, margin: '10px 0 0' }}>{structureErr}</p>
          )}

          {/* Structured preview */}
          {structured && (
            <div style={{
              marginTop: 16,
              background: C.bg,
              border: `1px solid ${C.borderGold}`,
              borderRadius: 10, padding: '16px',
            }}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: 'rgba(201,168,76,0.6)',
                margin: '0 0 14px',
              }}>AI Preview — review before saving</p>

              <Field label="Workstream"            value={structured.workstream} />
              <Field label="Technical Problem"     value={structured.technical_problem} />
              <Field label="Hypothesis"            value={structured.hypothesis} />
              <Field label="Work Performed"        value={structured.work_performed} />
              <Field label="Outcome"               value={structured.outcome} />
              <Field label="Remaining Uncertainty" value={structured.remaining_uncertainty} />
              <Field label="Related File"          value={structured.related_file} />

              {structured.funding_relevance?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: C.muted, margin: '0 0 6px',
                  }}>Funding Relevance</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                    {structured.funding_relevance.map(f => (
                      <FundingTag key={f} label={f} />
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1, padding: '12px',
                    background: C.gold, border: 'none', borderRadius: 8,
                    color: '#0a0908', fontSize: 13, fontWeight: 800,
                    letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                    cursor: saving ? 'wait' : 'pointer',
                    fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Save Entry'}
                </button>
                <button
                  onClick={() => setStructured(null)}
                  style={{
                    padding: '12px 16px',
                    background: 'none', border: `1px solid ${C.border}`,
                    borderRadius: 8, color: C.muted,
                    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Discard
                </button>
              </div>

              {saveMsg && (
                <p style={{
                  fontSize: 12, margin: '10px 0 0',
                  color: saveMsg.startsWith('✓') ? C.green : C.red,
                }}>
                  {saveMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION 2: Entry table ───────────────────────────────────────── */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '20px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: C.muted, margin: 0,
            }}>
              Log Entries
            </p>
            <span style={{
              fontSize: 11, color: C.gold,
              fontFamily: '"DM Mono", monospace', fontWeight: 700,
            }}>
              {entries.length} entries · {totalHours}h total
            </span>
          </div>

          {entries.length === 0 && (
            <p style={{ textAlign: 'center', color: C.muted, padding: '32px 0' }}>
              No entries yet
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {entries.map(entry => {
              const isExpanded = expandedId === entry.id
              return (
                <div
                  key={entry.id}
                  style={{
                    background: C.card2, border: `1px solid ${C.border}`,
                    borderRadius: 10, overflow: 'hidden',
                  }}
                >
                  {/* Row summary */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 700, color: C.text,
                          whiteSpace: 'nowrap' as const, overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {entry.workstream}
                        </span>
                        {entry.is_retroactive && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                            textTransform: 'uppercase' as const, padding: '2px 6px',
                            borderRadius: 4, background: 'rgba(255,255,255,0.04)',
                            color: C.muted, flexShrink: 0,
                          }}>
                            Historical
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 11, color: C.muted }}>
                          {fmtDate(entry.entry_date)}
                        </span>
                        <span style={{ fontSize: 11, color: C.muted }}>·</span>
                        <span style={{ fontSize: 11, color: C.secondary, fontWeight: 600 }}>
                          {entry.team_member}
                        </span>
                        {entry.hours && (
                          <>
                            <span style={{ fontSize: 11, color: C.muted }}>·</span>
                            <span style={{
                              fontSize: 11, color: C.gold,
                              fontFamily: '"DM Mono", monospace', fontWeight: 700,
                            }}>
                              {entry.hours}h
                            </span>
                          </>
                        )}
                        {entry.funding_relevance?.map(f => (
                          <FundingTag key={f} label={f} />
                        ))}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      borderTop: `1px solid ${C.border}`,
                      padding: '16px', background: C.bg,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
                        <Field label="Role"                  value={entry.role} />
                        <Field label="Related File"          value={entry.related_file} />
                        <Field label="Technical Problem"     value={entry.technical_problem} />
                        <Field label="Hypothesis"            value={entry.hypothesis} />
                      </div>
                      <Field label="Work Performed"        value={entry.work_performed} />
                      <Field label="Outcome"               value={entry.outcome} />
                      <Field label="Remaining Uncertainty" value={entry.remaining_uncertainty} />
                      {entry.evidence_link && (
                        <div style={{ marginBottom: 12 }}>
                          <p style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                            textTransform: 'uppercase', color: C.muted, margin: '0 0 4px',
                          }}>Evidence</p>
                          <a href={entry.evidence_link} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 13, color: C.gold, wordBreak: 'break-all' as const }}>
                            {entry.evidence_link}
                          </a>
                        </div>
                      )}
                      <Field label="Notes" value={entry.notes} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── SECTION 3: Export + Hours summary ───────────────────────────── */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '20px',
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: C.muted, margin: '0 0 16px',
          }}>
            Export & Summary
          </p>

          {/* Hours by member */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16,
          }}>
            {MEMBERS.filter(m => hoursByMember[m]).map(m => (
              <div key={m} style={{
                background: C.card2, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: '12px 14px',
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: C.muted, margin: '0 0 5px',
                }}>
                  {m}
                </p>
                <p style={{
                  fontSize: 24, fontWeight: 800, color: C.gold,
                  margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em',
                }}>
                  {hoursByMember[m]}h
                </p>
              </div>
            ))}
          </div>

          {/* Funding relevance breakdown */}
          <div style={{ marginBottom: 16 }}>
            {FUNDING_OPTIONS.map(f => {
              const count = entries.filter(e => e.funding_relevance?.includes(f)).length
              const hrs   = entries
                .filter(e => e.funding_relevance?.includes(f) && e.hours)
                .reduce((s, e) => s + Number(e.hours), 0)
              if (!count) return null
              return (
                <div key={f} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <FundingTag label={f} />
                  <span style={{
                    fontSize: 12, color: C.secondary,
                    fontFamily: '"DM Mono", monospace',
                  }}>
                    {count} entries · {hrs}h
                  </span>
                </div>
              )
            })}
          </div>

          <button
            onClick={handleExport}
            style={{
              width: '100%', padding: '12px',
              background: C.goldDim, border: `1px solid ${C.borderGold}`,
              borderRadius: 10, cursor: 'pointer',
              color: C.gold, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.04em', fontFamily: 'inherit',
            }}
          >
            ↓ Export Full Log as CSV
          </button>
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: #5a5040; }
        input:focus, textarea:focus { border-color: rgba(201,168,76,0.3) !important; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  )
}
