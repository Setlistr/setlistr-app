import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const notion = {
  headers: {
    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  }
}

async function queryDatabase(databaseId: string) {
  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: notion.headers,
    body: JSON.stringify({ page_size: 50 })
  })
  const data = await res.json()
  return data.results || []
}

function extractText(prop: any): string {
  if (!prop) return ''
  if (prop.title) return prop.title.map((t: any) => t.plain_text).join('')
  if (prop.rich_text) return prop.rich_text.map((t: any) => t.plain_text).join('')
  if (prop.select) return prop.select.name || ''
  if (prop.status) return prop.status.name || ''
  if (prop.people) return prop.people.map((p: any) => p.name).join(', ')
  return ''
}

async function updateWeeklyPulse(digest: string) {
  const pageId = 'cbb15a5bbb9f453398e19e4d947ef939'

  await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: `Monday Digest — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: digest } }]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        }
      ]
    })
  })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.DIGEST_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [investorRows, devRows, artistRows] = await Promise.all([
      queryDatabase('49adf9131b00443fb8044d745b3f59fc'),
      queryDatabase('335ee8bbfa154215a620e2875741d099'),
      queryDatabase('d08d0051430742bda22a7199c3bae860'),
    ])

    const investors = investorRows.map((r: any) => ({
      name: extractText(r.properties['Name'] || r.properties['Company']),
      stage: extractText(r.properties['Stage'] || r.properties['Status']),
      notes: extractText(r.properties['Notes']),
    })).filter((i: any) => i.name)

    const devTasks = devRows.map((r: any) => ({
      task: extractText(r.properties['Task']),
      status: extractText(r.properties['Status']),
      owner: extractText(r.properties['Owner']),
      priority: extractText(r.properties['Priority']),
    })).filter((t: any) => t.task && t.status !== 'Done')

    const artists = artistRows.map((r: any) => ({
      name: extractText(r.properties['Name']),
      status: extractText(r.properties['Status']),
    })).filter((a: any) => a.name)

    const context = `
INVESTOR PIPELINE (${investors.length} investors):
${investors.map((i: any) => `- ${i.name} | Stage: ${i.stage} | Notes: ${i.notes}`).join('\n')}

DEV BOARD - OPEN TASKS (${devTasks.length} tasks):
${devTasks.map((t: any) => `- [${t.priority}] ${t.task} | ${t.status} | Owner: ${t.owner}`).join('\n')}

ARTIST & BETA PIPELINE (${artists.length} artists):
${artists.map((a: any) => `- ${a.name} | ${a.status}`).join('\n')}
`

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are the chief of staff for Setlistr Inc., a live performance royalty infrastructure startup. Every Monday morning you send Jesse Slack (CEO) a concise weekly briefing based on the current state of the company's Notion databases.

Write a Monday morning briefing email body (no subject line) that is direct, tactical, and under 300 words. Cover:
1. Investor pipeline — who needs follow-up this week, any momentum to flag
2. Dev board — what's in progress, any blockers, what's high priority
3. Artist pipeline — any notable signups or status changes

Be direct. Write like a smart operator, not a cheerleader. Flag what needs attention.

Here is the current data:
${context}`
      }]
    })

    const digest = (message.content[0] as any).text

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Setlistr OS <digest@setlistr.ai>',
        to: ['jesse@setlistr.ai'],
        subject: `Weekly Pulse — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
        text: digest
      })
    })

    if (!emailRes.ok) {
      throw new Error(`Resend error: ${emailRes.status}`)
    }

    try {
      await updateWeeklyPulse(digest)
    } catch (notionError) {
      console.error('Weekly Pulse Notion update failed:', notionError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Weekly digest error:', error)
    return NextResponse.json({ error: 'Digest failed' }, { status: 500 })
  }
}
