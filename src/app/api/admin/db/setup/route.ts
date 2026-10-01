import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured. Add DATABASE_URL to your environment variables first.' },
      { status: 503 }
    );
  }

  try {
    await ensureSchema();
    return NextResponse.json({ ok: true, message: 'Database schema is ready.' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to set up database schema.' },
      { status: 500 }
    );
  }
}
