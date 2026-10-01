import { NextResponse } from 'next/server';
import { deleteCustomerSession, isDbConfigured } from '@/lib/db';
import { CUSTOMER_SESSION_COOKIE, getSessionTokenFromRequest } from '@/lib/auth';

export async function POST(request: Request) {
  const token = getSessionTokenFromRequest(request, CUSTOMER_SESSION_COOKIE);

  if (token && isDbConfigured()) {
    await deleteCustomerSession(token).catch(() => {});
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(CUSTOMER_SESSION_COOKIE, '', { maxAge: 0, path: '/' });
  return response;
}
