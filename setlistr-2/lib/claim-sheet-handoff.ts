// Getting the claim sheet file off the page.
//
// Browsers: a blob link with `download` saves the file.
//
// The installed app is a WKWebView run by Capacitor iOS, which has no
// download handling. Its navigation handler treats the blob: URL as outside
// the app and hands it to the system, which has no handler for `blob:`, and
// cancels it. The page hears nothing back. So in the app the file goes to the
// system share sheet (Web Share API with a file) where the web view offers it,
// and otherwise the sheet's text is shown to copy, with the reason. No plugin
// or native change.

export type HandoffRoute = 'download' | 'share' | 'text'

export function chooseHandoffRoute(env: { native: boolean; canShareFile: boolean }): HandoffRoute {
  if (!env.native) return 'download'
  return env.canShareFile ? 'share' : 'text'
}

// The share sheet was dismissed: not a failure, and nothing to report.
export function isShareCancel(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError'
}

export function claimSheetFile(text: string, filename: string): File | null {
  try { return new File([text], filename, { type: 'text/plain' }) } catch { return null }
}

export function canShareFile(nav: Navigator | undefined, file: File | null): boolean {
  try {
    return !!(file && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }))
  } catch { return false }
}

// The browser download, unchanged from the released page.
export function downloadTextFile(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
