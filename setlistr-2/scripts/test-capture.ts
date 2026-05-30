import crypto from 'crypto'
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// run script: npm run test-capture scripts/test-audio/riley_taylor_acoutic1.m4a "initial test as is"

// ─── CONFIG — edit between runs ───────────────────────────────────────────────
const TEST_CONFIG = {
  testId:                   'test_002',
  catalogueFallbackEnabled: true,
  acrStrong:                80,
  acrSuggest:               55,
  flapMinCount:             3,
  chunkDurationSeconds:     12,
  chunkIntervalSeconds:     20,
}

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
  detected:       boolean
  rawTitle:       string
  cleanedTitle:   string
  artist:         string
  acrScore:       number
  effectiveScore: number
  source:         'humming' | 'fingerprint'
}

const NO_DETECT: ACRResult = {
  detected: false, rawTitle: '', cleanedTitle: '', artist: '',
  acrScore: 0, effectiveScore: 0, source: 'fingerprint',
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
  const rawScore       = acrMatch.score ? parseFloat(acrMatch.score) : 0
  const acrScore       = humming ? rawScore * 100 : rawScore
  const HUMMING_BOOST_MIN = 45
  const effectiveScore = (humming && acrScore >= HUMMING_BOOST_MIN) ? Math.max(acrScore, 85) : acrScore
  const rawTitle       = acrMatch.title as string
  const cleanedTitle   = cleanTitle(rawTitle)
  const artist         = (acrMatch.artists?.[0]?.name as string) || ''

  return { detected: true, rawTitle, cleanedTitle, artist, acrScore, effectiveScore, source }
}

// ─── Decision logic ───────────────────────────────────────────────────────────
interface DecisionResult {
  confidenceLevel:            'auto' | 'suggest' | 'no_result'
  catalogueFallbackTriggered: boolean
  failureReason:              string
}

async function decide(acr: ACRResult): Promise<DecisionResult> {
  if (!acr.detected) {
    return { confidenceLevel: 'no_result', catalogueFallbackTriggered: false, failureReason: 'no_detection' }
  }

  const { cleanedTitle, acrScore, effectiveScore } = acr

  // ── Catalogue-first check (mirrors /api/identify catalog-first block) ──────
  if (effectiveScore >= 60) {
    const fallback = await checkCatalogueFallback(cleanedTitle)
    if (fallback.matched) {
      return {
        confidenceLevel: 'auto', catalogueFallbackTriggered: true,
        failureReason: `catalogue_fallback: score=${acrScore}`,
      }
    }
  }

  // ── Standard confidence tiers ─────────────────────────────────────────────
  if (effectiveScore >= TEST_CONFIG.acrStrong) {
    return { confidenceLevel: 'auto', catalogueFallbackTriggered: false, failureReason: 'strong_match' }
  }
  if (effectiveScore >= TEST_CONFIG.acrSuggest) {
    return { confidenceLevel: 'suggest', catalogueFallbackTriggered: false, failureReason: `suggest: score=${effectiveScore}` }
  }
  return { confidenceLevel: 'no_result', catalogueFallbackTriggered: false, failureReason: `score_too_low: ${effectiveScore}` }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ─── Excel output ─────────────────────────────────────────────────────────────
const RUN_HEADERS = [
  'testId', 'date', 'audio_file', 'notes',
  'catalogueFallbackEnabled', 'acrStrong', 'acrSuggest',
  'flapMinCount', 'chunkDurationSeconds', 'chunkIntervalSeconds',
]

const DETECTION_HEADERS = [
  'testId', 'chunk_number', 'chunk_start_seconds', 'raw_title',
  'cleaned_title', 'artist', 'acr_score', 'effective_score',
  'confidence_level', 'source', 'catalogue_fallback_triggered', 'failure_reason',
]

interface DetectionRow {
  chunk_number:               number
  chunk_start_seconds:        number
  raw_title:                  string
  cleaned_title:              string
  artist:                     string
  acr_score:                  number
  effective_score:            number
  confidence_level:           string
  source:                     string
  catalogue_fallback_triggered: boolean
  failure_reason:             string
}

function writeExcel(detectionRows: DetectionRow[]): void {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true })

  const wb = fs.existsSync(OUTPUT_FILE) ? XLSX.readFile(OUTPUT_FILE) : XLSX.utils.book_new()

  // ── Tab 1: Test Runs ──────────────────────────────────────────────────────
  const existingRuns: any[][] = wb.Sheets['Test Runs']
    ? (XLSX.utils.sheet_to_json(wb.Sheets['Test Runs'], { header: 1 }) as any[][])
    : [RUN_HEADERS]

  existingRuns.push([
    TEST_CONFIG.testId,
    new Date().toISOString(),
    AUDIO_FILE,
    NOTES,
    TEST_CONFIG.catalogueFallbackEnabled,
    TEST_CONFIG.acrStrong,
    TEST_CONFIG.acrSuggest,
    TEST_CONFIG.flapMinCount,
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
      TEST_CONFIG.testId,
      row.chunk_number,
      row.chunk_start_seconds,
      row.raw_title,
      row.cleaned_title,
      row.artist,
      row.acr_score,
      row.effective_score,
      row.confidence_level,
      row.source,
      row.catalogue_fallback_triggered,
      row.failure_reason,
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
  console.log(`Catalogue fallback: ${TEST_CONFIG.catalogueFallbackEnabled ? 'ON' : 'OFF'}`)
  console.log(`Thresholds: auto=${TEST_CONFIG.acrStrong} suggest=${TEST_CONFIG.acrSuggest}\n`)

  const detectionRows: DetectionRow[] = []
  let detectionCount = 0

  for (let i = 0; i < totalChunks; i++) {
    const startSeconds = i * TEST_CONFIG.chunkIntervalSeconds
    const chunkPath    = path.join('/tmp', `setlistr_chunk_${process.pid}_${i}.${EXT}`)

    try {
      extractChunk(AUDIO_FILE_PATH, startSeconds, chunkPath)
      const acr = await identifyChunk(chunkPath)
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath)
      const decision = await decide(acr)

      if (acr.detected && decision.confidenceLevel !== 'no_result') {
        detectionCount++
        const via = decision.catalogueFallbackTriggered ? ' via catalogue_fallback' : ''
        console.log(`[${i + 1}/${totalChunks}] ${formatTime(startSeconds)} — "${acr.cleanedTitle}" by ${acr.artist} (${decision.confidenceLevel}${via}, ${acr.effectiveScore.toFixed(1)})`)
      } else {
        console.log(`[${i + 1}/${totalChunks}] ${formatTime(startSeconds)} — no detection`)
      }

      detectionRows.push({
        chunk_number:               i + 1,
        chunk_start_seconds:        startSeconds,
        raw_title:                  acr.rawTitle,
        cleaned_title:              acr.cleanedTitle,
        artist:                     acr.artist,
        acr_score:                  acr.acrScore,
        effective_score:            acr.effectiveScore,
        confidence_level:           decision.confidenceLevel,
        source:                     acr.source,
        catalogue_fallback_triggered: decision.catalogueFallbackTriggered,
        failure_reason:             decision.failureReason,
      })
    } catch (err) {
      if (fs.existsSync(chunkPath)) fs.unlinkSync(chunkPath)
      console.error(`[${i + 1}/${totalChunks}] error at ${formatTime(startSeconds)}:`, err)
      detectionRows.push({
        chunk_number:               i + 1,
        chunk_start_seconds:        startSeconds,
        raw_title: '', cleaned_title: '', artist: '',
        acr_score: 0, effective_score: 0,
        confidence_level: 'no_result', source: 'fingerprint',
        catalogue_fallback_triggered: false,
        failure_reason: `error: ${String(err)}`,
      })
    }
  }

  writeExcel(detectionRows)
  console.log(`\nDone. ${detectionCount}/${totalChunks} chunks detected. Output: ${OUTPUT_FILE}`)
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1) })
