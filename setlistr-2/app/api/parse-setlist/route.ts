import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', // Samsung sends image/jpg
  'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
  'application/pdf', 'text/plain',
]
const MAX_SIZE = 10 * 1024 * 1024

// ── Fuzzy match helpers ───────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similarity(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return 1.0

  const wordsA = new Set(na.split(' ').filter(w => w.length > 2))
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let overlap = 0
  wordsA.forEach(w => { if (wordsB.has(w)) overlap++ })
  const score = (overlap * 2) / (wordsA.size + wordsB.size)

  if (na.includes(nb) || nb.includes(na)) return Math.max(score, 0.85)

  return score
}

function fuzzyMatch(
  claudeTitle: string,
  catalog: { title: string; artist: string; user_song_id: string }[]
): { title: string; artist: string; user_song_id?: string } | null {
  let best: { score: number; song: typeof catalog[0] } | null = null

  for (const song of catalog) {
    const score = similarity(claudeTitle, song.title)
    if (score > 0.65 && (!best || score > best.score)) {
      best = { score, song }
    }
  }

  if (best) {
    return {
      title: best.song.title,
      artist: best.song.artist,
      user_song_id: best.song.user_song_id,
    }
  }
  return null
}

// ── Normalise MIME type — Samsung sends 'image/jpg', we need 'image/jpeg' ─────
function normaliseMime(mime: string, filename: string): string {
  const lower = mime.toLowerCase()
  if (lower === 'image/jpg') return 'image/jpeg'
  // Fallback: infer from filename if mime is empty or generic
  if (!mime || mime === 'application/octet-stream') {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
    if (ext === 'png') return 'image/png'
    if (ext === 'webp') return 'image/webp'
    if (ext === 'heic' || ext === 'heif') return 'image/heic'
    if (ext === 'pdf') return 'application/pdf'
  }
  return lower
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileName = (file.name || '').toLowerCase()
    let mimeType = normaliseMime(file.type, fileName)

    console.log('uploaded file', { name: file.name, originalType: file.type, normalisedType: mimeType, size: file.size })

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File is too large. Maximum size is 10MB.' }, { status: 400 })
    }

    const isHEIC = mimeType === 'image/heic' || mimeType === 'image/heif'
      || fileName.endsWith('.heic') || fileName.endsWith('.heif')

    if (!ALLOWED_TYPES.includes(mimeType) && !isHEIC) {
      return NextResponse.json({
        error: `Unsupported file type (${file.type}). Please upload a JPG, PNG, PDF, or TXT file.`,
      }, { status: 400 })
    }

    let bytes = await file.arrayBuffer()

    // ── HEIC conversion ───────────────────────────────────────────────────────
    if (isHEIC) {
      try {
        const sharp = (await import('sharp')).default
        const jpegBuffer = await sharp(Buffer.from(bytes)).jpeg({ quality: 90 }).toBuffer()
        bytes = jpegBuffer.buffer.slice(jpegBuffer.byteOffset, jpegBuffer.byteOffset + jpegBuffer.byteLength) as ArrayBuffer
        mimeType = 'image/jpeg'
        console.log('HEIC converted, size:', jpegBuffer.length)
      } catch (err) {
        console.error('HEIC conversion failed:', err)
        return NextResponse.json({
          error: 'Could not convert iPhone photo. Try a screenshot instead (Side + Volume Up).',
        }, { status: 422 })
      }
    }

    // ── EXIF rotation fix for Android/Samsung ─────────────────────────────────
    // Samsung cameras embed EXIF rotation rather than physically rotating pixels.
    // Sharp strips EXIF and physically rotates, fixing upside-down/sideways images.
    if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
      try {
        const sharp = (await import('sharp')).default
        const rotated = await sharp(Buffer.from(bytes)).rotate().jpeg({ quality: 92 }).toBuffer()
        bytes = rotated.buffer.slice(rotated.byteOffset, rotated.byteOffset + rotated.byteLength) as ArrayBuffer
        mimeType = 'image/jpeg'
        console.log('EXIF rotation applied, size:', rotated.length)
      } catch (err) {
        // Non-fatal — proceed with original bytes
        console.warn('EXIF rotation failed (non-fatal):', err)
      }
    }

    const base64 = Buffer.from(bytes).toString('base64')
    let songs: { title: string; artist?: string }[] = []

    if (mimeType === 'text/plain') {
      const text = Buffer.from(bytes).toString('utf-8')
      songs = parseTextSetlist(text)
    } else {
      const claudeMediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'application/pdf'

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: mimeType === 'application/pdf' ? 'document' : 'image',
              source: { type: 'base64', media_type: claudeMediaType, data: base64 },
            } as any,
            {
              type: 'text',
              text: `This is a musician's setlist. Extract every song title in order, exactly as written.

Return ONLY a JSON array like this:
[{"title": "Song Title", "artist": "Artist or empty string"}]

Rules:
- Keep exact order
- Strip numbering (1. 2. etc)
- Strip timing notes like (3:45)
- Skip section headers like "Set 1" or "Encore"
- Return valid JSON only, no markdown`,
            },
          ],
        }],
      })

      const raw = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text).join('\n').trim()

      console.log('Claude response:', raw.slice(0, 200))

      try {
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        songs = JSON.parse(cleaned)
        if (!Array.isArray(songs)) throw new Error('Not an array')
      } catch {
        return NextResponse.json({
          error: 'Could not read the setlist. Try a clearer photo or add songs manually.',
        }, { status: 422 })
      }
    }

    // ── Sanitize ──────────────────────────────────────────────────────────────
    let sanitized = songs
      .filter(s => s.title?.trim())
      .map((s, i) => ({ title: s.title.trim(), artist: (s.artist || '').trim(), position: i }))
      .slice(0, 40)

    if (sanitized.length === 0) {
      return NextResponse.json({
        error: 'No songs found. Try a clearer photo or add songs manually.',
      }, { status: 422 })
    }

    // ── Catalog fuzzy matching ────────────────────────────────────────────────
    if (userId) {
      try {
        const { data: userSongs } = await supabase
          .from('user_songs')
          .select('id, title, artist')
          .eq('user_id', userId)

        if (userSongs && userSongs.length > 0) {
          const catalog = userSongs.map(s => ({
            title: s.title,
            artist: s.artist || '',
            user_song_id: s.id,
          }))

          sanitized = sanitized.map(song => {
            const match = fuzzyMatch(song.title, catalog)
            if (match) {
              console.log(`Matched "${song.title}" → "${match.title}"`)
              return { ...song, title: match.title, artist: match.artist || song.artist }
            }
            return song
          })
        }
      } catch (err) {
        console.error('Catalog match error (non-fatal):', err)
      }
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
    .split('\n').map(l => l.trim()).filter(l => l.length > 0)
    .filter(l => !/^(set\s*\d|encore|intro|outro|break)/i.test(l))
    .map(line => {
      const stripped = line.replace(/^\d+[\.\)\-\s]+/, '').trim()
      const noTiming = stripped.replace(/\s*\(\d+:\d+\)\s*$/, '').trim()
      const byMatch   = noTiming.match(/^(.+?)\s+by\s+(.+)$/i)
      const dashMatch = noTiming.match(/^(.+?)\s+-\s+(.+)$/)
      if (byMatch)   return { title: byMatch[1].trim(),   artist: byMatch[2].trim() }
      if (dashMatch) return { title: dashMatch[1].trim(), artist: dashMatch[2].trim() }
      return { title: noTiming, artist: '' }
    })
    .filter(s => s.title.length > 0)
}
