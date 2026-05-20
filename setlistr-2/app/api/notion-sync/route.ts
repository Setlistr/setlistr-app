import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await req.json()
  const record = payload.record

  try {
    const notionRes = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_ARTISTS_DATABASE_ID },
        properties: {
          'Name': {
            title: [{ text: { content: record.full_name || record.email || 'Unknown' } }]
          },
          'Status': {
            select: { name: 'Beta Active' }
          },
          'Source': {
            rich_text: [{ text: { content: 'App signup' } }]
          },
          'Shows Captured': {
            number: 0
          },
          'Notes': {
            rich_text: [{ text: { content: `Signed up: ${new Date(record.created_at).toLocaleDateString()}. PRO: ${record.pro_affiliation || 'Not set'}. City: ${record.city || 'Not set'}.` } }]
          }
        }
      })
    })

    if (!notionRes.ok) {
      const err = await notionRes.text()
      console.error('Notion error:', err)
      return NextResponse.json({ error: 'Notion API failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Notion sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
