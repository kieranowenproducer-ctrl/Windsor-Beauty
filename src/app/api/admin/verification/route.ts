import { NextResponse } from 'next/server';
import { isDbConfigured, listVerificationAuditLog } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 503 });
  }
  const log = await listVerificationAuditLog(500);
  return NextResponse.json({ log });
}
