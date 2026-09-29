// Small, pure display helpers for app/app/review/[id]/page.tsx's post-save
// "Show complete" ceremony — factored out so they're directly testable
// without a DOM/timer harness.

// The count-up animation's displayed integer at a given eased progress.
// Previously floored (`Math.floor(eased * target)`), which — combined with
// the cubic ease-out curve's own shape, where `eased` approaches 1 slowly at
// the very end — means the displayed number sits at `target - 1` for a
// disproportionate share of the animation's final stretch before jumping to
// `target` only in the last frame or two. Rounding instead reaches the true
// final value earlier and far more robustly; an artist who glances at the
// number, or whose device drops the last animation frame (backgrounding,
// scroll-driven frame throttling), is far less likely to walk away having
// only ever seen one less than the real count.
export function countAt(progress: number, target: number): number {
  const clamped = Math.max(0, Math.min(1, progress))
  const eased = 1 - Math.pow(1 - clamped, 3)
  return Math.round(eased * target)
}

export type FlowSource = 'live' | 'upload' | null

// "Captured live" is only true for an actual live-capture session — an
// uploaded recording of a past show was never captured live BY Setlistr,
// regardless of how the show itself was performed. flowSource comes from
// the ?source=live|upload query param both entry points already append when
// routing to Review (see app/app/review/[id]/page.tsx's flowSourceRef).
export function capturedLabel(flowSource: FlowSource): string {
  if (flowSource === 'upload') return 'From your recording'
  if (flowSource === 'live') return 'Captured live'
  // Genuinely unknown source (shouldn't happen — both entry points always
  // set it) — a neutral claim that's true either way, never asserting a
  // capture method that may not have happened.
  return 'On the record'
}
