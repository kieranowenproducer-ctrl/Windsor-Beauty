import { NextResponse } from 'next/server';

// Legacy activation by an email address and names proved no ownership.
// Keep the route explicit and fail closed; callers must use the emailed recovery link.
export async function POST() {
  return NextResponse.json({
    error: 'Please use Forgot password to receive a secure email link, then complete member registration.',
    redirect: '/account/forgot-password',
  }, { status: 410 });
}
