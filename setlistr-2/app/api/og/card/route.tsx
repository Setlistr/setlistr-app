import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// TODO: Full share card implementation coming in feature/share-cards branch
// Known issues to fix on rebuild:
// 1. performances.status is 'complete' not 'completed' — city visit count queries must use .eq('status', 'complete')
// 2. @vercel/og ImageResponse requires static TTF fonts — variable fonts (DM Sans, Bebas Neue from Google Fonts) crash with parseFvarAxis error
//    Solution: bundle pre-converted static TTF subsets in public/fonts/ and load with fs.readFile, OR use a font CDN that serves static files
// 3. Font loading must use nodejs runtime not edge runtime for fs access

export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'coming_soon', message: 'Share cards launching soon' })
}
