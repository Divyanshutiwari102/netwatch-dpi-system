import { NextRequest, NextResponse } from 'next/server'
import { signToken, validateCredentials } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const user = validateCredentials(email, password)
    if (!user) {
      // Constant-time response to prevent timing attacks
      await new Promise((r) => setTimeout(r, 150))
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = await signToken(user)
    return NextResponse.json({ token, user })
  } catch (e) {
    console.error('[auth/login]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
