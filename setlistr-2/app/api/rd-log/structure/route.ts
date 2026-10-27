import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ADMIN_EMAILS } from '@/lib/admin-config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `You are an R&D documentation assistant for Setlistr Inc., a live performance tracking and royalty submission platform. Core R&D frame: AI-assisted live performance attribution using hybrid audio recognition and setlist-constrained verification to generate structured performance records for royalty reporting. Tech stack: Next.js 14.2.5, TypeScript, Supabase, Vercel, ACRCloud. Take a casual description of work done and structure it into a formal R&D log entry. Respond ONLY with valid JSON, no markdown, no preamble: { "workstream": "", "technical_problem": "", "hypothesis": "", "work_performed": "", "outcome": "", "remaining_uncertainty": "", "related_file": "", "funding_relevance": [] } where funding_relevance is an array containing only applicable values from: "Section 41", "IRAP", "NSF SBIR", "Patent".`

// Admin-only, like its only caller (the R&D Log at /app/admin/rd-log) and
// its sibling /api/rd-log: a signed-in session whose email is in
// ADMIN_EMAILS. Checked on the server before the request body is read and
// before any (paid) Anthropic call; everyone else is refused with no
// provider call at all.
export async function POST(req: NextRequest) {
  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_EMAILS.includes(user.email ?? '')) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  try {
    const { description, member, hours, evidence } = await req.json()

    if (!description?.trim()) {
      return NextResponse.json({ error: 'description required' }, { status: 400 })
    }

    const userContent = [
      `Team member: ${member || 'Jesse'}`,
      hours ? `Hours spent: ${hours}` : null,
      evidence ? `Evidence / links: ${evidence}` : null,
      `Work description: ${description}`,
    ].filter(Boolean).join('\n')

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    let structured: Record<string, any>
    try {
      structured = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: 'AI returned unparseable response', raw },
        { status: 500 }
      )
    }

    return NextResponse.json({ structured })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
