import { NextResponse } from 'next/server';

// Configurable via env var so the code can be changed without touching code
// or redeploying logic — see proxy.ts, which reads the same env var to
// decide whether the coming-soon wall is active at all.
export const dynamic = 'force-dynamic';

const LAUNCH_ACCESS_CODE = process.env.LAUNCH_ACCESS_CODE;
const LAUNCH_COOKIE = 'wb_launch_access';

export async function POST(request: Request) {
  if (!LAUNCH_ACCESS_CODE) {
    return NextResponse.json({ error: 'Access code is not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!code || code !== LAUNCH_ACCESS_CODE) {
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(LAUNCH_COOKIE, LAUNCH_ACCESS_CODE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return response;
}
