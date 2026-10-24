// Spreadsheet import: read a file in the browser (docs/spreadsheet-import-plan.md).
// The file never leaves the device; only the confirmed rows' mapped fields
// are sent when importing. The parsers load only here, on the import page.
import { fromExcelDate, MAX_ROWS, type RawCell, type RawSheet } from './sheet'

export const MAX_BYTES = 5 * 1024 * 1024
export class ReadError extends Error {}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function readSpreadsheet(file: File): Promise<{ sheets: RawSheet[]; sha256: string }> {
  const name = file.name.toLowerCase()
  if (file.size > MAX_BYTES) throw new ReadError('This file is over 5 MB. Remove other sheets or columns, then try again.')
  if (name.endsWith('.xls')) throw new ReadError('This is an older Excel file (.xls). Save it as .xlsx, then try again.')
  if (name.endsWith('.numbers')) throw new ReadError('Export it from Numbers as .xlsx or .csv, then try again.')
  const buf = await file.arrayBuffer()
  const sha256 = await sha256Hex(buf)
  let sheets: RawSheet[]
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    let read
    try { read = await readXlsxFile(file) } catch { throw new ReadError('This file couldn’t be read as a spreadsheet. Check it opens in Excel or Sheets, then try again.') }
    sheets = read.map(s => ({ name: s.sheet, rows: s.data.map(r => r.map(cellFromXlsx)) }))
  } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    const { default: Papa } = await import('papaparse')
    const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '')
    const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimiter: name.endsWith('.tsv') ? '\t' : '' })
    sheets = [{ name: file.name, rows: res.data.map(r => r.map(c => (c ?? '').trim())) }]
  } else {
    throw new ReadError('Choose an Excel (.xlsx), CSV or TSV file.')
  }
  sheets = sheets.filter(s => s.rows.some(r => r.some(c => c !== null && c !== '')))
  if (!sheets.length) throw new ReadError('This file has no rows.')
  for (const s of sheets) if (s.rows.length > MAX_ROWS + 20) throw new ReadError(`“${s.name}” has more than ${MAX_ROWS} rows. Split it into smaller files, then import each one.`)
  return { sheets, sha256 }
}

function cellFromXlsx(c: unknown): RawCell {
  if (c === null || c === undefined) return null
  if (c instanceof Date) return fromExcelDate(c)
  if (typeof c === 'number' || typeof c === 'boolean') return c
  return String(c)
}
