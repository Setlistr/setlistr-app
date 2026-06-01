import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return NextResponse.json({ status: 'coming_soon', message: 'Share cards launching soon' })
}
