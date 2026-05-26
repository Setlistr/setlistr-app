import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Google access token')
  return data.access_token
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.DIGEST_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const accessToken = await getGoogleAccessToken()

    const { fileId, fileName } = await req.json()

    // Fetch doc content from Google Docs API
    const docRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${fileId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    console.log('Doc fetch status:', docRes.status)

    if (!docRes.ok) {
      throw new Error(`Google Docs API error: ${docRes.status}`)
    }

    const doc = await docRes.json()

    // Extract plain text from doc
    const text = doc.body.content
      .map((block: any) => {
        if (block.paragraph) {
          return block.paragraph.elements
            .map((el: any) => el.textRun?.content || '')
            .join('')
        }
        return ''
      })
      .join('')
      .trim()

    console.log('Extracted text length:', text.length, 'Preview:', text.slice(0, 200))

    if (!text || text.length < 100) {
      return NextResponse.json({ skipped: true, reason: 'Doc too short' })
    }

    // Send to Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are reviewing a meeting transcript for Setlistr Inc., a live performance royalty infrastructure startup. Extract action items and key decisions only. Be concise. Format as a JSON array like this:
[
  { "task": "Follow up with Doug re: SAFE note", "owner": "Jesse", "priority": "High" },
  { "task": "Spencer to fix Android camera bug", "owner": "Spencer", "priority": "High" }
]

Return ONLY the JSON array, no other text.

Transcript:
${text.slice(0, 8000)}`
      }]
    })

    const raw = (message.content[0] as any).text.trim()
    console.log('Claude raw response:', raw)
    const clean = raw.replace(/```json|```/g, '').trim()
    const items = JSON.parse(clean)
    console.log('Parsed items:', items.length)

    // Push each action item to Notion Dev Board
    const notionResults = await Promise.all(
      items.map((item: any) =>
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
              Owner: { rich_text: [{ text: { content: item.owner || '' } }] },
              Priority: { select: { name: item.priority || 'Medium' } },
              Meeting: { rich_text: [{ text: { content: fileName } }] },
              Status: { status: { name: 'Todo' } },
            },
          }),
        })
      )
    )

    return NextResponse.json({ success: true, tasksCreated: items.length })
  } catch (error) {
    console.error('Transcript sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
