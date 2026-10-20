// DB-free tests for lib/claim-sheet-handoff.ts. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-claim-sheet-handoff.ts
import { chooseHandoffRoute, isShareCancel, canShareFile } from '../lib/claim-sheet-handoff'
import { isNativeApp } from '../lib/appearance'

let pass = 0, fail = 0
function check(name: string, ok: boolean) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

check('browser: download, whatever Web Share offers', chooseHandoffRoute({ native: false, canShareFile: true }) === 'download' && chooseHandoffRoute({ native: false, canShareFile: false }) === 'download')
check('installed app with file sharing: share sheet', chooseHandoffRoute({ native: true, canShareFile: true }) === 'share')
check('installed app without file sharing: text to copy, never a blob link', chooseHandoffRoute({ native: true, canShareFile: false }) === 'text')
check('dismissing the share sheet is a cancel', isShareCancel({ name: 'AbortError' }))
check('other share errors are failures', !isShareCancel({ name: 'NotAllowedError' }) && !isShareCancel(new Error('x')) && !isShareCancel(null))
const file = { name: 'a.txt' } as unknown as File
check('no file: cannot share', !canShareFile({ share: () => Promise.resolve(), canShare: () => true } as unknown as Navigator, null))
check('no Web Share: cannot share', !canShareFile({} as Navigator, file) && !canShareFile(undefined, file))
check('canShare refuses files: cannot share', !canShareFile({ share: () => Promise.resolve(), canShare: () => false } as unknown as Navigator, file))
check('canShare throws: cannot share', !canShareFile({ share: () => Promise.resolve(), canShare: () => { throw new Error('x') } } as unknown as Navigator, file))
check('share and canShare accept the file: can share', canShareFile({ share: () => Promise.resolve(), canShare: () => true } as unknown as Navigator, file))
// The app shell is detected by the bridge Capacitor iOS injects (shared with appearance).
check('installed iOS app detected by the Capacitor bridge', isNativeApp({ webkit: { messageHandlers: { bridge: {} } } }))
check('Safari is not the installed app', !isNativeApp({ webkit: { messageHandlers: {} } }) && !isNativeApp({}))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
