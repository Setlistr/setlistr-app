import crypto from 'crypto'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// run script: npm run test-capture scripts/test-audio/city_and_colour1.mp3 "city and colour yt to mp3 test"
// run script: npm run test-capture scripts/test-audio/tyler_childers_tiny_desk.mp3 "tyler childers"
// run script: npm run test-capture scripts/test-audio/robyn1.m4a "robyn cma fest"
// run script: npm run test-capture scripts/test-audio/owen1.m4a "owen1 cma"
// run script: npm run test-capture scripts/test-audio/bradcox1.m4a "brad cox1"

// ─── CONFIG — edit between runs ───────────────────────────────────────────────
const TEST_CONFIG = {
  catalogueFallbackEnabled: true,
  chunkDurationSeconds:     14,
  chunkIntervalSeconds:     20,
}

// Run timestamp — 'yyyy-mm-dd, hh:mm'
function runTimestamp(): string {
  const d   = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const RUN_DATETIME = runTimestamp()

// ─── CLI args ─────────────────────────────────────────────────────────────────
const AUDIO_FILE = process.argv[2]
const NOTES      = process.argv[3] || ''

if (!AUDIO_FILE) {
  console.error('Error: no audio file provided.')
  console.error('Usage: npm run test-capture scripts/test-audio/some-show.m4a "optional notes"')
  process.exit(1)
}

const AUDIO_FILE_PATH = path.resolve(process.cwd(), AUDIO_FILE)
if (!fs.existsSync(AUDIO_FILE_PATH)) {
  console.error(`Error: file not found: ${AUDIO_FILE_PATH}`)
  process.exit(1)
}

const EXT         = path.extname(AUDIO_FILE_PATH).replace('.', '') || 'm4a'
const OUTPUT_DIR  = path.resolve(__dirname, 'test-results')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'test-results.xlsx')

// ─── ACRCloud credentials ─────────────────────────────────────────────────────
const HOST          = 'identify-us-west-2.acrcloud.com'
const ACCESS_KEY    = '81af58b16d932703e6a233f054666f3b'
const ACCESS_SECRET = 'vNLUzrw4OOaiKiaw4FTdPQlqTNTGj3VbCNmotS22'

// ─── Helpers — verbatim from /api/identify/route.ts ──────────────────────────
const VERSION_SUFFIX_RE = /\s*[\(\[](alternate|alternative|live|edit|radio edit|radio|album version|acoustic|acoustic version|remaster|remastered|instrumental|original mix|original|extended|extended mix|deluxe|explicit|clean|single|mono|stereo|demo|bonus track|remix|mixed|mix|re-mix|part \d+|teil \d+|vol\.?\s*\d+|version|ver\.?)[^\)\]]*[\)\]]/gi

function cleanTitle(raw: string): string {
  return raw.replace(VERSION_SUFFIX_RE, '').replace(/\s+/g, ' ').trim()
}

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

// ─── Supabase ─────────────────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local')
  return createClient(url, key)
}

// ─── Catalogue fallback check ─────────────────────────────────────────────────
async function checkCatalogueFallback(title: string): Promise<{ matched: boolean }> {
  if (!TEST_CONFIG.catalogueFallbackEnabled) return { matched: false }
  try {
    const normalizedTitle = normalizeSongKey(title)
    if (!normalizedTitle || normalizedTitle.length < 3) return { matched: false }
    const { data } = await getSupabase()
      .from('catalogue_fallback')
      .select('id')
      .eq('normalized_title', normalizedTitle)
      .limit(1)
    return { matched: !!(data && data.length > 0) }
  } catch (err) {
    console.error('[CatalogueFallback] check failed:', err)
    return { matched: false }
  }
}

// ─── ffprobe: get audio duration ──────────────────────────────────────────────
function getAudioDuration(filePath: string): number {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error('ffprobe failed — is ffmpeg installed? Run: brew install ffmpeg')
  }
  return parseFloat(result.stdout.trim())
}

// ─── ffmpeg: extract chunk ────────────────────────────────────────────────────
function extractChunk(inputPath: string, startSeconds: number, chunkPath: string): void {
  const result = spawnSync('ffmpeg', [
    '-ss', startSeconds.toString(),
    '-i', inputPath,
    '-t', TEST_CONFIG.chunkDurationSeconds.toString(),
    '-c', 'copy',
    '-y', chunkPath,
  ], { stdio: 'pipe' })
  if (result.status !== 0) throw new Error(`ffmpeg failed at offset ${startSeconds}s`)
}

// ─── ACRCloud identify ────────────────────────────────────────────────────────
interface ACRResult {
  detected:     boolean
  rawTitle:     string
  cleanedTitle: string
  artist:       string
  acrScore:     number
  source:       'humming' | 'fingerprint'
}

const NO_DETECT: ACRResult = {
  detected: false, rawTitle: '', cleanedTitle: '', artist: '',
  acrScore: 0, source: 'fingerprint',
}

async function identifyChunk(chunkPath: string): Promise<ACRResult> {
  const audioBuffer = fs.readFileSync(chunkPath)
  if (audioBuffer.length < 100) return NO_DETECT

  const timestamp    = Math.floor(Date.now() / 1000).toString()
  const stringToSign = ['POST', '/v1/identify', ACCESS_KEY, 'audio', '1', timestamp].join('\n')
  const signature    = crypto.createHmac('sha1', ACCESS_SECRET).update(stringToSign).digest('base64')

  const mimeType = EXT === 'mp3' ? 'audio/mpeg' : EXT === 'wav' ? 'audio/wav' : `audio/${EXT}`
  const form     = new FormData()
  form.append('access_key', ACCESS_KEY)
  form.append('sample_bytes', audioBuffer.length.toString())
  form.append('sample', new Blob([audioBuffer], { type: mimeType }), `sample.${EXT}`)
  form.append('timestamp', timestamp)
  form.append('signature', signature)
  form.append('data_type', 'audio')
  form.append('signature_version', '1')

  const res     = await fetch(`https://${HOST}/v1/identify`, { method: 'POST', body: form })
  const payload = await res.json() as any

  const humming     = payload?.metadata?.humming?.[0]
  const music       = payload?.metadata?.music?.[0]
  const acrMatch    = humming || music
  const acrDetected = payload.status?.code === 0 && !!acrMatch
  if (!acrDetected) return NO_DETECT

  const source: 'humming' | 'fingerprint' = humming ? 'humming' : 'fingerprint'
  const rawScore     = acrMatch.score ? parseFloat(acrMatch.score) : 0
  const acrScore     = humming ? rawScore * 100 : rawScore
  const rawTitle     = acrMatch.title as string
  const cleanedTitle = cleanTitle(rawTitle)
  const artist       = (acrMatch.artists?.[0]?.name as string) || ''

  return { detected: true, rawTitle, cleanedTitle, artist, acrScore, source }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Excel output ─────────────────────────────────────────────────────────────
const RUN_HEADERS = [
  'datetime', 'audio_file', 'notes',
  'catalogueFallbackEnabled', 'chunkDurationSeconds', 'chunkIntervalSeconds',
]

const DETECTION_HEADERS = [
  'datetime', 'audio_file', 'chunk_number', 'chunk_start_seconds',
  'cleaned_title', 'artist', 'acr_score', 'source', 'fallback',
]

interface DetectionRow {
  chunk_number:        number
  chunk_start_seconds: number
  cleaned_title:       string
  artist:              string
  acr_score:           number
  source:              string
  fallback:            boolean
}

function writeExcel(detectionRows: DetectionRow[]): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const wb = fs.existsSync(OUTPUT_FILE) ? XLSX.readFile(OUTPUT_FILE) : XLSX.utils.book_new()

  // ── Tab 1: Test Runs ──────────────────────────────────────────────────────
  const existingRuns: any[][] = wb.Sheets['Test Runs']
    ? (XLSX.utils.sheet_to_json(wb.Sheets['Test Runs'], { header: 1 }) as any[][])
    : [RUN_HEADERS]

  existingRuns.push([
    RUN_DATETIME,
    path.basename(AUDIO_FILE),
    NOTES,
    TEST_CONFIG.catalogueFallbackEnabled,
    TEST_CONFIG.chunkDurationSeconds,
    TEST_CONFIG.chunkIntervalSeconds,
  ])

  const runsSheet = XLSX.utils.aoa_to_sheet(existingRuns)
  if (wb.Sheets['Test Runs']) { wb.Sheets['Test Runs'] = runsSheet }
  else { XLSX.utils.book_append_sheet(wb, runsSheet, 'Test Runs') }

  // ── Tab 2: Detections ─────────────────────────────────────────────────────
  const existingDetections: any[][] = wb.Sheets['Detections']
    ? (XLSX.utils.sheet_to_json(wb.Sheets['Detections'], { header: 1 }) as any[][])
    : [DETECTION_HEADERS]

  for (const row of detectionRows) {
    existingDetections.push([
      RUN_DATETIME,
      path.basename(AUDIO_FILE),
      row.chunk_number,
      row.chunk_start_seconds,
      row.cleaned_title,
      row.artist,
      row.acr_score,
      row.source,
      row.fallback,
    ])
  }

  const detectionsSheet = XLSX.utils.aoa_to_sheet(existingDetections)
  if (wb.Sheets['Detections']) { wb.Sheets['Detections'] = detectionsSheet }
  else { XLSX.utils.book_append_sheet(wb, detectionsSheet, 'Detections') }

  XLSX.writeFile(wb, OUTPUT_FILE)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const duration    = getAudioDuration(AUDIO_FILE_PATH)
  const totalChunks = Math.floor((duration - TEST_CONFIG.chunkDurationSeconds) / TEST_CONFIG.chunkIntervalSeconds) + 1

  console.log(`\nAudio: ${path.basename(AUDIO_FILE_PATH)} (${Math.round(duration)}s)`)
  console.log(`Chunks: ${totalChunks} × ${TEST_CONFIG.chunkDurationSeconds}s every ${TEST_CONFIG.chunkIntervalSeconds}s`)
  console.log(`Catalogue fallback: ${TEST_CONFIG.catalogueFallbackEnabled ? 'ON' : 'OFF'}\n`)

  const detectionRows: DetectionRow[] = []
  let detectionCount = 0

  for (let i = 0; i < totalChunks; i++) {
    const startSeconds = i * TEST_CONFIG.chunkIntervalSeconds
    const chunkPath    = path.join('/tmp', `setlistr_chunk_${process.pid}_${i}.${EXT}`)

    try {
      extractChunk(AUDIO_FILE_PATH, startSeconds, chunkPath)
      const acr = await identifyChunk(chunkPath)
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath)

      const fallback = acr.detected
        ? (await checkCatalogueFallback(acr.cleanedTitle)).matched
        : false

      if (acr.detected) {
        detectionCount++
        const tag = fallback ? ' — FALLBACK' : ''
        console.log(`${formatTime(startSeconds)} — ${acr.artist} — ${acr.cleanedTitle} — ${acr.source} — ${acr.acrScore.toFixed(1)}${tag}`)
      } else {
        console.log(`${formatTime(startSeconds)} — no detection`)
      }

      detectionRows.push({
        chunk_number:        i + 1,
        chunk_start_seconds: startSeconds,
        cleaned_title:       acr.cleanedTitle,
        artist:              acr.artist,
        acr_score:           acr.acrScore,
        source:              acr.source,
        fallback,
      })
    } catch (err) {
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath)
      console.error(`${formatTime(startSeconds)} — error:`, err)
      detectionRows.push({
        chunk_number:        i + 1,
        chunk_start_seconds: startSeconds,
        cleaned_title: '', artist: '',
        acr_score: 0, source: 'fingerprint',
        fallback: false,
      })
    }
  }

  writeExcel(detectionRows)
  console.log(`\nDone. ${detectionCount}/${totalChunks} chunks detected. Output: ${OUTPUT_FILE}`)
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1) })
