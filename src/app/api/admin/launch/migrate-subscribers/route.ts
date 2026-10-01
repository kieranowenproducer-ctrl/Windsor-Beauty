import { NextResponse } from 'next/server';
import { isDbConfigured, migrateLaunchSubscribersToCustomers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  }

  try {
    const result = await migrateLaunchSubscribersToCustomers();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Migration failed. Please try again shortly.' }, { status: 500 });
  }
}
