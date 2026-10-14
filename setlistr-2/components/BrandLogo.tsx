import Image from 'next/image'

// The Setlistr wordmark at the size the artist app header renders it
// (components/layout/AppShell.tsx: /logo-white.png at width 120, which —
// because that file is a 4320px square that's mostly transparent padding,
// and Tailwind's preflight sets img { height: auto } — paints a ~96×18px
// wordmark). This uses the pre-cropped /logo-white-tight.png (3444×652) so
// the box IS the wordmark: 18px tall, ~95px wide, no invisible padding to
// throw off alignment. Marketing/auth screens use this to match the app.
export const BRAND_LOGO_HEIGHT = 18
// AppShell's wordmark also sits 12px inside its 16px header gutter (x≈28),
// because logo-white.png's transparent padding is ~12px at that width.
// Callers matching the app header add this inset so the logo doesn't jump
// between the marketing/auth screens and the app. If the app headers adopt
// BrandLogo, drop this to 0 there and here together.
export const BRAND_LOGO_APP_INSET = 12

export function BrandLogo({ priority = false, className }: { priority?: boolean; className?: string }) {
  return (
    <Image
      src="/logo-white-tight.png"
      alt="Setlistr"
      className={className}
      // Intrinsic 190×36 (same ratio) so next/image's srcset stays sharp
      // where a page renders it at the larger marketing size on Retina;
      // the style below sets the displayed app-header size.
      width={190}
      height={36}
      priority={priority}
      // Both dimensions fixed (95×18 ≈ the file's 5.28:1 ratio): with only one
      // set, next/image warns, since preflight's height:auto changes the other.
      style={{ height: BRAND_LOGO_HEIGHT, width: 95, display: 'block', flexShrink: 0 }}
    />
  )
}
