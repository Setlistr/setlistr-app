// The app's page frame (docs/ui-standard.md → Layout): the dashboard's
// width tiers and gutters, chosen by the width the page actually has (the
// content area beside the desktop sidebar), not the window.
//   under 600px  480px column, 20px gutters (aligned with the app header)
//   600–899px    640px column, 32px gutters
//   900px+       1120px frame, 48px gutters
// On framed routes AppShell owns the safe areas, so pages add no safe-area
// padding of their own. Full-screen capture (/app/live/, AppShell's
// FULLSCREEN_ROUTES) is outside this frame and handles its own insets.
export function PageFrame({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="sl-frame-cq">
      <div className="sl-frame" style={style}>{children}</div>
    </div>
  )
}
