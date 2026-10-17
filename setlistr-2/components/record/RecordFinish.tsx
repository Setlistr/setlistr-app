'use client'
// The post-save celebration's lifetime progress: a compact, labelled
// "Your record · N shows" line and the dashboard's shared Next milestone row,
// with the capture orb finishing onto it. The celebration is about the saved
// show, so the large lifetime counter stays on the dashboard, and nothing
// here gives this show a number of its own.
//
// The orb breathes once over the venue, then travels to this show's dot and
// becomes it. The count steps up ONLY when this save is what put the show on
// the record (data.added); a show that was already counted — any show that
// reached review, every re-save — lands on its existing dot with no step and
// no milestone. If this show isn't the newest on the record, its dot isn't
// "the last one" (a backdated show), so the orb rests on the pip beside
// "Show complete" instead.
// Count data that isn't ready when the orb chooses (about 0.3s in) gets the
// pip too; the counter then appears, already settled, when it arrives.
// Reduced motion: no orb, the settled counter at once. Nothing here blocks
// input, and any scroll/touch/key finishes the motion immediately.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MILESTONE_STEP } from '@/lib/record-summary'
import { NextMilestoneRow } from './NextMilestone'
import { Skeleton } from '@/components/ui/Skeleton'

export type RecordFinishData =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; count: number; isLatest: boolean; added: boolean }

// The capture orb's listening gold — the same in both themes, as on the
// capture screen. The pip beside "Show complete" uses it too.
export const ORB_GOLD = 'radial-gradient(circle at 40% 35%, #e8c76a, #c9a84c 55%, #a07828)'

const BREATH_MS = 300   // orb breathes over the venue
const LAND_MS = 930     // orb arrives on the dot (or the pip)
const FADE_MS = 150     // orb hands over to the dot
const HOLD_MS = 520     // a block completed by THIS save holds before the next starts

export function RecordFinish({ data, label, startRef, pipRef, onLanded }: {
  data: RecordFinishData
  label: string
  startRef: React.RefObject<HTMLElement>
  pipRef: React.RefObject<HTMLElement>
  onLanded: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef(data); dataRef.current = data
  const landedRef = useRef(onLanded); landedRef.current = onLanded
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [phase, setPhase] = useState<'pre' | 'hold' | 'rest'>(reduced ? 'rest' : 'pre')
  // Decided once, when the orb picks its destination: whether this finish
  // steps the count up, and whether the count was there to land on at all.
  const [decision, setDecision] = useState<{ step: boolean; hadData: boolean } | null>(null)
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)
  useEffect(() => { setPortalHost(document.body) }, [])

  // Runs once the orb is in the document (it renders through a portal, so
  // not on the first pass). Anything missing: settle at once, never stall.
  useEffect(() => {
    if (reduced) { setDecision({ step: false, hadData: true }); landedRef.current(); return }
    if (!portalHost) return
    const orb = orbRef.current, start = startRef.current
    if (!orb || !start) { setDecision({ step: false, hadData: dataRef.current.status === 'ready' }); setPhase('rest'); landedRef.current(); return }
    const anims: Animation[] = []
    const timers: number[] = []
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      anims.forEach(a => a.cancel()); timers.forEach(clearTimeout)
      orb.style.opacity = '0'
      setDecision(d => d ?? { step: false, hadData: dataRef.current.status === 'ready' })
      setPhase('rest'); landedRef.current()
    }
    const centre = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width } }
    const S = orb.offsetWidth
    const at = (p: { x: number; y: number }, scale: number) => `translate(${p.x - S / 2}px, ${p.y - S / 2}px) scale(${scale})`
    const from = centre(start)
    anims.push(orb.animate([
      { opacity: 1, transform: at(from, 0.94) },
      { opacity: 1, transform: at(from, 1.04), offset: 0.5 },
      { opacity: 1, transform: at(from, 1) },
    ], { duration: BREATH_MS, easing: 'ease-in-out', fill: 'forwards' }))

    timers.push(window.setTimeout(() => {
      const d = dataRef.current
      let target: Element | null = null
      let step = false
      if (d.status === 'ready' && d.isLatest) {
        target = rootRef.current?.querySelector(`[data-show="${d.count}"]`) ?? null
        step = d.added
      }
      // A dot below the fold would pull the eye off the top of the page.
      if (target) { const r = target.getBoundingClientRect(); if (r.top < 0 || r.bottom > window.innerHeight) { target = null; step = false } }
      if (!target) target = pipRef.current
      setDecision({ step, hadData: d.status === 'ready' })
      if (!target) { finish(); return }
      const to = centre(target)
      anims.push(orb.animate([
        { opacity: 1, transform: at(from, 1) },
        { opacity: 1, transform: at(to, Math.max(to.w, 8) / S) },
      ], { duration: LAND_MS - BREATH_MS, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' }))
      timers.push(window.setTimeout(() => {
        anims.push(orb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' }))
        landedRef.current()
        if (step && d.status === 'ready' && d.count % MILESTONE_STEP === 0) {
          setPhase('hold')
          timers.push(window.setTimeout(() => { setPhase('rest'); finished = true }, HOLD_MS))
        } else { setPhase('rest'); finished = true }
      }, LAND_MS - BREATH_MS))
    }, BREATH_MS))

    // The artist reaching for the page ends the motion at once.
    const opts = { passive: true } as AddEventListenerOptions
    window.addEventListener('wheel', finish, opts)
    window.addEventListener('touchmove', finish, opts)
    window.addEventListener('keydown', finish)
    return () => {
      window.removeEventListener('wheel', finish, opts)
      window.removeEventListener('touchmove', finish, opts)
      window.removeEventListener('keydown', finish)
      anims.forEach(a => a.cancel()); timers.forEach(clearTimeout)
    }
  }, [portalHost]) // eslint-disable-line react-hooks/exhaustive-deps

  const orb = !reduced && portalHost && createPortal(
    <div ref={orbRef} data-record-orb="" aria-hidden="true" style={{
      position: 'fixed', top: 0, left: 0, width: 'clamp(96px, 26vw, 136px)', aspectRatio: '1', borderRadius: '50%',
      pointerEvents: 'none', zIndex: 40, opacity: 0, willChange: 'transform, opacity',
      background: ORB_GOLD,
      boxShadow: '0 0 60px #c9a84c80, 0 0 120px #c9a84c30, inset 0 1px 0 rgba(255,255,255,0.25)',
    }} />,
    portalHost,
  )

  // The orb stays at the same place in the tree whatever the data does, so
  // it is never re-created mid-flight.
  if (data.status === 'unavailable') return <>{orb}</>
  if (data.status === 'loading') return (<>{orb}
    <div ref={rootRef} className="rf" aria-busy="true" aria-label="Loading your record" style={{ textAlign: 'left', marginBottom: 28 }}>
      <Skeleton w="45%" h={16} />
      <Skeleton h={1.5} mt={10} r={0} /><Skeleton h={18} mt={14} /><Skeleton h={10} mt={14} />
    </div>
  </>)

  const before = phase === 'pre' && (decision ? decision.step : data.added && data.isLatest)
  const shown = before ? data.count - 1 : data.count
  const holdBlock = phase === 'hold' ? { first: data.count - MILESTONE_STEP + 1, next: data.count } : undefined
  const arrivedLate = !!decision && !decision.hadData

  // Lifetime progress in the dashboard's own small type: the label as its
  // overline (14/600 gold), the figure as a ledger value (16/600). No display
  // numeral, no clipping container, no transform.
  return (<>{orb}
    <section ref={rootRef} className="rf" aria-label={`${label}, ${data.count} ${data.count === 1 ? 'show' : 'shows'}`} style={{ textAlign: 'left', marginBottom: 28, animation: arrivedLate ? 'rfFade 0.35s ease both' : undefined }}>
      <p aria-hidden="true" style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 10px', lineHeight: 1.35 }}>
        <span style={{ fontSize: 'var(--d-ov, 14px)', fontWeight: 600, color: 'var(--sl-gold-text)' }}>{label}</span>
        <span style={{ color: 'var(--sl-text-3)' }}>·</span>
        <span data-record-count={shown} style={{ fontSize: 'var(--d-value, 16px)', fontWeight: 600, color: 'var(--sl-text)', fontVariantNumeric: 'tabular-nums' }}>{shown} <span style={{ fontWeight: 400, color: 'var(--sl-text-3)' }}>{shown === 1 ? 'show' : 'shows'}</span></span>
      </p>
      <div style={{ borderTop: '1.5px solid var(--sl-text)' }}>
        <NextMilestoneRow count={shown} block={holdBlock} hideValue={!!holdBlock} />
      </div>
      <style>{`@keyframes rfFade { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </section>
  </>)
}
