import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
]

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Log what's coming in
    console.log('uploaded file', {
      name: file.name,
      type: file.type,
      size: file.size,
    })

    // Size check
    if (file.size > MAX_SIZE) {
      return NextResponse.json({
        error: 'File is too large. Maximum size is 10MB.',
      }, { status: 400 })
    }

    const fileName = (file.name || '').toLowerCase()
    const isHEIC = file.type === 'image/heic' || file.type === 'image/heif'
      || fileName.endsWith('.heic') || fileName.endsWith('.heif')

    // Type check — allow HEIC since we convert it
    if (!ALLOWED_TYPES.includes(file.type) && !isHEIC) {
      return NextResponse.json({
        error: `Unsupported file type (${file.type || 'unknown'}). Please upload a JPG, PNG, PDF, or TXT file.`,
      }, { status: 400 })
    }

    let bytes = await file.arrayBuffer()
    let mimeType: string = file.type

    // ── HEIC/HEIF → JPEG conversion ──────────────────────────────────────
    if (isHEIC) {
      try {
        console.log('Converting HEIC to JPEG...')
        const sharp = (await import('sharp')).default
        const inputBuffer = Buffer.from(bytes)
        const jpegBuffer = await sharp(inputBuffer)
          .jpeg({ quality: 90 })
          .toBuffer()
        bytes = jpegBuffer.buffer.slice(
          jpegBuffer.byteOffset,
          jpegBuffer.byteOffset + jpegBuffer.byteLength
        )
        mimeType = 'image/jpeg'
        console.log('HEIC conversion successful, jpeg size:', jpegBuffer.length)
      } catch (convErr) {
        console.error('HEIC conversion failed:', convErr)
        return NextResponse.json({
          error: 'Could not convert your iPhone photo. Please take a screenshot instead (Side button + Volume Up) and upload that.',
        }, { status: 422 })
      }
    }

    const base64 = Buffer.from(bytes).toString('base64')

    let songs: { title: string; artist?: string }[] = []

    if (mimeType === 'text/plain') {
      // Parse text directly — no Claude needed
      const text = Buffer.from(bytes).toString('utf-8')
      songs = parseTextSetlist(text)
    } else {
      // Image or PDF — use Claude vision
      const claudeMediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf'

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: mimeType === 'application/pdf' ? 'document' : 'image',
                source: {
                  type: 'base64',
                  media_type: claudeMediaType,
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
- Do not include section headers like "Set 1" or "Encore" as songs
- Return valid JSON only, no explanation, no markdown`,
              },
            ],
          },
        ],
      })

      // Robust response parsing
      const raw = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim()

      console.log('Claude raw response:', raw.slice(0, 200))

      try {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        songs = JSON.parse(cleaned)
        if (!Array.isArray(songs)) throw new Error('Not an array')
      } catch {
        return NextResponse.json({
          error: 'Could not read the setlist from this file. Try a clearer photo or type songs manually.',
        }, { status: 422 })
      }
    }

    const sanitized = songs
      .filter(s => s.title && s.title.trim().length > 0)
      .map((s, i) => ({
        title: s.title.trim(),
        artist: (s.artist || '').trim(),
        position: i,
      }))
      .slice(0, 40)

    if (sanitized.length === 0) {
      return NextResponse.json({
        error: 'No songs found. Try a clearer photo or type songs manually.',
      }, { status: 422 })
    }

    return NextResponse.json({ songs: sanitized, count: sanitized.length })

  } catch (err: any) {
    console.error('Parse setlist error:', err)
    return NextResponse.json({
      error: 'Something went wrong. Please try again or add songs manually.',
    }, { status: 500 })
  }
}

function parseTextSetlist(text: string): { title: string; artist?: string }[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !/^(set\s*\d|encore|intro|outro|break)/i.test(line))
    .map(line => {
      const stripped = line.replace(/^\d+[\.\)\-\s]+/, '').trim()
      const noTiming = stripped.replace(/\s*\(\d+:\d+\)\s*$/, '').trim()
      const byMatch   = noTiming.match(/^(.+?)\s+by\s+(.+)$/i)
      const dashMatch = noTiming.match(/^(.+?)\s+-\s+(.+)$/)
      if (byMatch)   return { title: byMatch[1].trim(), artist: byMatch[2].trim() }
      if (dashMatch) return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() }
      return { title: noTiming, artist: '' }
    })
    .filter(s => s.title.length > 0)
}
