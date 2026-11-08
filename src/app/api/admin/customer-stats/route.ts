import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db/client';
import { listCustomerStatsPeople } from '@/lib/db/customerStats';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!isDbConfigured()) return NextResponse.json({ people: [], dbConfigured: false }, { headers });
  try {
    return NextResponse.json({ people: await listCustomerStatsPeople(), dbConfigured: true, at: new Date().toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: 'Could not load the customer stats.' }, { status: 503, headers });
  }
}
