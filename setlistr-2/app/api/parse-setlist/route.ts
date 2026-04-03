import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
    const isImage = allowedTypes.includes(file.type) || file.type.startsWith('image/')
    const isPDF = file.type === 'application/pdf'
    const isText = file.type === 'text/plain'

    if (!isImage && !isPDF && !isText) {
      return NextResponse.json({ 
        error: 'Unsupported file type. Please upload an image (JPG, PNG), PDF, or text file.' 
      }, { status: 400 })
    }

    let songs: { title: string; artist?: string }[] = []

    if (isText) {
      // Plain text — parse directly without Claude
      const text = Buffer.from(bytes).toString('utf-8')
      songs = parseTextSetlist(text)
    } else {
      // Image or PDF — use Claude vision
      const mediaType = isPDF ? 'application/pdf' : (mimeType || 'image/jpeg')

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: isPDF ? 'document' : 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as any,
                  data: base64,
                },
              } as any,
              {
                type: 'text',
                text: `This is a musician's setlist. Extract every song title in order, exactly as written.

Return ONLY a JSON array of objects with this exact structure, nothing else:
[{"title": "Song Title", "artist": "Artist Name or empty string"}]

Rules:
- Preserve the exact order shown
- Include every song you can read, even if partially legible
- If no artist is shown, use empty string for artist
- Strip any numbering (1. 2. etc) from the title
- Strip any timing notes like (3:45) from the title  
- If you see "x2" or "repeat" notes, include the song once
- Do not include section headers like "Set 1" "Encore" as songs
- Return valid JSON only, no explanation, no markdown`,
              },
            ],
          },
        ],
      })

      const raw = response.content[0].type === 'text' ? response.content[0].text : ''
      
      try {
        // Strip any markdown code fences if present
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        songs = JSON.parse(cleaned)
        if (!Array.isArray(songs)) throw new Error('Not an array')
      } catch {
        return NextResponse.json({ 
          error: 'Could not parse the setlist from this image. Try a clearer photo or type the songs manually.' 
        }, { status: 422 })
      }
    }

    // Sanitize
    const sanitized = songs
      .filter(s => s.title && s.title.trim().length > 0)
      .map((s, i) => ({
        title: s.title.trim(),
        artist: (s.artist || '').trim(),
        position: i,
      }))
      .slice(0, 40) // hard cap — no setlist has 40 songs

    if (sanitized.length === 0) {
      return NextResponse.json({ 
        error: 'No songs found. Try a clearer photo or type the songs manually.' 
      }, { status: 422 })
    }

    return NextResponse.json({ songs: sanitized, count: sanitized.length })

  } catch (err: any) {
    console.error('Parse setlist error:', err)
    return NextResponse.json({ 
      error: 'Something went wrong. Please try again or add songs manually.' 
    }, { status: 500 })
  }
}

// Simple line-by-line parser for plain text files
function parseTextSetlist(text: string): { title: string; artist?: string }[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !/^(set\s*\d|encore|intro|outro|break)/i.test(line))
    .map(line => {
      // Strip leading numbers: "1. " "1) " "1 - "
      const stripped = line.replace(/^\d+[\.\)\-\s]+/, '').trim()
      // Strip trailing timing: "(3:45)"
      const noTiming = stripped.replace(/\s*\(\d+:\d+\)\s*$/, '').trim()
      // Try to split "Title - Artist" or "Title by Artist"
      const byMatch = noTiming.match(/^(.+?)\s+by\s+(.+)$/i)
      const dashMatch = noTiming.match(/^(.+?)\s+-\s+(.+)$/)
      if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() }
      if (dashMatch) return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() }
      return { title: noTiming, artist: '' }
    })
    .filter(s => s.title.length > 0)
}
