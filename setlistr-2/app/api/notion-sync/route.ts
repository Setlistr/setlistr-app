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
      const err = await notionRes.json()
      console.error('Notion error:', err)
      return NextResponse.json({ error: 'Notion API failed', details: err }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Notion sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.SUPABASE_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { user_id, email, show_date } = await req.json()

  const notionHeaders = {
    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  }

  try {
    const searchRes = await fetch('https://api.notion.com/v1/databases/d08d0051430742bda22a7199c3bae860/query', {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({
        filter: {
          property: 'Name',
          title: { contains: email },
        },
      }),
    })

    const searchData = await searchRes.json()
    const page = searchData.results?.[0]

    if (!page) {
      console.log('Notion artist not found for:', email, 'user_id:', user_id)
      return NextResponse.json({ notFound: true })
    }

    const currentCount = page.properties['Shows Captured']?.number ?? 0

    const updateRes = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      headers: notionHeaders,
      body: JSON.stringify({
        properties: {
          'Shows Captured': { number: currentCount + 1 },
          'Last Show': { date: { start: show_date } },
        },
      }),
    })

    if (!updateRes.ok) {
      const err = await updateRes.json()
      console.error('Notion update error:', err)
      return NextResponse.json({ error: 'Notion update failed', details: err }, { status: 500 })
    }

    return NextResponse.json({ success: true, showsCaptured: currentCount + 1 })

  } catch (error) {
    console.error('Notion show count error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
