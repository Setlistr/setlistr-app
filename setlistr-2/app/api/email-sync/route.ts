import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.DIGEST_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { subject, from, body } = await req.json()

    if (!body || body.length < 20) {
      return NextResponse.json({ skipped: true, reason: 'Email too short' })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are reviewing an email sent to Jesse Slack, CEO of Setlistr Inc. (a live performance royalty infrastructure startup). Determine if this email requires action.

If it's a newsletter, automated notification, receipt, spam, or general FYI with no action required, return: {"actionable": false}

If it requires action, extract the action items and return a JSON array like:
{"actionable": true, "items": [{"task": "Reply to Doug re: SAFE note terms", "owner": "Jesse", "priority": "High"}]}

Priority is High if time-sensitive or from an investor/PRO/publisher/legal contact. Medium otherwise.

Return ONLY valid JSON, no other text.

From: ${from}
Subject: ${subject}
Body: ${body}`
      }]
    })

    const raw = (message.content[0] as any).text.trim()
    const clean = raw.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    if (!result.actionable || !result.items?.length) {
      return NextResponse.json({ skipped: true, reason: 'Not actionable' })
    }

    // Create tasks in Notion Meeting Action Items database
    await Promise.all(
      result.items.map((item: any) =>
        fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({
            parent: { database_id: '36c4519246488091a1fee60fa50eb896' },
            properties: {
              Task: { title: [{ text: { content: item.task } }] },
              Owner: { rich_text: [{ text: { content: item.owner || 'Jesse' } }] },
              Priority: { select: { name: item.priority || 'Medium' } },
              Meeting: { rich_text: [{ text: { content: `Email: ${subject}` } }] },
              Date: { date: { start: new Date().toISOString().split('T')[0] } },
              Status: { status: { name: 'Todo' } },
            },
          }),
        })
      )
    )

    return NextResponse.json({ success: true, tasksCreated: result.items.length })
  } catch (error) {
    console.error('Email sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
