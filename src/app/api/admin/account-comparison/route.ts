import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { compareAccounts } from '@/lib/db/accountComparison';

// Behind every Compare button on a "may be a second account" finding: the customers list, the
// Security Review queue. Two accounts side by side with what matches marked.
//
// Everything under /api/admin is behind the admin session cookie in src/proxy.ts. Read only.

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Administrator sign-in required.'},{status:401});
  const url = new URL(request.url);
  const subject = Number(url.searchParams.get('a'));
  const other = Number(url.searchParams.get('b'));
  if (!Number.isInteger(subject) || !Number.isInteger(other) || subject <= 0 || other <= 0 || subject === other) {
    return NextResponse.json({ error: 'Two different customer numbers are needed to compare.' }, { status: 400 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'The database is not connected, so nothing could be compared.' }, { status: 503 });
  }
  try {
    const comparison = await compareAccounts(subject, other);
    if (!comparison) {
      return NextResponse.json(
        { error: 'One of these accounts no longer exists, so there is nothing to compare it with.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ comparison });
  } catch {
    return NextResponse.json({ error: 'The comparison could not be loaded just now. Try again in a moment.' }, { status: 500 });
  }
}
