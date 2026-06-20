import { NextRequest, NextResponse } from 'next/server'

const BACKEND_API = (process.env.NEXT_PUBLIC_GROWSTREAMS_API || 'http://localhost:1337').replace(/\/$/, '')
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '50'

  try {
    const response = await fetch(`${BACKEND_API}/api/analytics/transactions?limit=${limit}`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Backend API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Backend API error: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Analytics transactions proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transactions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
