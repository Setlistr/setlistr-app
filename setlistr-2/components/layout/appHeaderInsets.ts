// Top safe-area geometry for the app's mobile headers (AppShell,
// ManagerShell) and anything that sticks beneath them (/app/proof's bar).
//
// WebKit exposes only the safe-area RECTANGLE, never the cutout's shape, and
// iOS has no public API for the Dynamic Island/notch frame. So the band above
// the safe area can't be shown to be clear on ANY device that has a top
// inset — which is why controls never go there, rather than guessing the
// device from the inset's size:
// - top inset 0 (Safari, which keeps the page inside the safe area itself;
//   the native app in landscape; phones without a cutout): the compact 56px
//   header, exactly as before.
// - any top inset (the native iOS app in portrait, viewport-fit=cover set in
//   app/layout.tsx): the controls sit in a 44px row directly BELOW the inset;
//   the band above holds only the header's background.
const TOP_INSET = 'env(safe-area-inset-top, 0px)'

export const APP_HEADER_PADDING_TOP = TOP_INSET

// 56px when the inset is 0; inset + 44px otherwise (e.g. 59 → 103).
export const APP_HEADER_HEIGHT = `max(56px, calc(${TOP_INSET} + 44px))`

// Where a sticky bar inside AppShell sticks: 0 when the inset is 0 (so it
// slides over the header, as it always has in Safari), otherwise exactly at
// the header's bottom edge — below the safe area, whatever the inset is.
// min() with inset × 1000 is the switch: 0 → 0, any real inset → the height.
export const BELOW_APP_HEADER_STICKY_TOP = `min(${APP_HEADER_HEIGHT}, calc(${TOP_INSET} * 1000))`
