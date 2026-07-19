import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ADMIN_EMAILS } from '@/lib/admin-config'
import { runEngine } from '@/lib/reconciliation/engine'
import { RECONCILIATION_CONFIG } from '@/lib/reconciliation/config'
import {
  insertReconciliationRun, completeReconciliationRun, insertReconciliationConclusions,
} from '@/lib/reconciliation/db'

// Admin-triggered engine run, from the Reconciliation tab's "Run engine"
// button. Calls the existing engine entry point (lib/reconciliation/engine.ts)
// and persistence helpers (lib/reconciliation/db.ts) exactly as
// scripts/reconcile.ts does — no engine logic lives in this route, and
// nothing in lib/reconciliation/ is modified by it.
//
// Deliberately does not compute scoring (unlike the CLI harness): this
// button is for running the engine against arbitrary performances from the
// admin panel, most of which have no artist-confirmed truth or truth-file
// to score against. `scoring` is left as `{}` (persisted, not null — an
// honest "ran, not scored" marker distinct from a CLI benchmark run).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const performanceId = body?.performance_id
  if (!performanceId || typeof performanceId !== 'string') {
    return NextResponse.json({ error: 'performance_id required' }, { status: 400 })
  }

  let runId: string | null = null
  try {
    runId = await insertReconciliationRun({
      performance_id: performanceId,
      mode: 'engine',
      engine_version: RECONCILIATION_CONFIG.ENGINE_VERSION,
      params: { label: 'admin-triggered', truth_source: 'none', triggered_by: user.email },
    })

    const { conclusions } = await runEngine(performanceId)
    await insertReconciliationConclusions(runId, conclusions)

    const tierCounts = conclusions.reduce((acc: Record<string, number>, c) => {
      acc[c.tier] = (acc[c.tier] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    await completeReconciliationRun(runId, { tier_counts: tierCounts, note: 'admin-triggered — no truth/scoring computed' }, 'completed')

    return NextResponse.json({
      success: true,
      run_id: runId,
      conclusion_count: conclusions.length,
      tier_counts: tierCounts,
    })
  } catch (err: any) {
    console.error('[RunReconciliation] Error:', err)
    if (runId) {
      await completeReconciliationRun(runId, {}, 'failed', err.message).catch(() => {})
    }
    return NextResponse.json({ error: err.message || 'Engine run failed', run_id: runId }, { status: 500 })
  }
}
