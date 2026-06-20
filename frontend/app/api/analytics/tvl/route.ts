import { NextRequest, NextResponse } from 'next/server'

const BACKEND_API = (process.env.NEXT_PUBLIC_GROWSTREAMS_API || 'http://localhost:1337').replace(/\/$/, '')
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_API}/api/analytics/tvl`, {
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

    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data)
    } else {
      const text = await response.text()
      console.error('Non-JSON response from backend:', text)
      return NextResponse.json(
        { error: 'Backend returned non-JSON response', details: text },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Analytics TVL proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch TVL data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
