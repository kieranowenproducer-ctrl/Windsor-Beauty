import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import { claimDatabaseForThisShop, seedStarterProducts } from '@/lib/db/starterSeed';

export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured. Add DATABASE_URL to your environment variables first.' },
      { status: 503 }
    );
  }

  try {
    // Refuses, before anything is created, if this is another shop's database.
    await claimDatabaseForThisShop();
    await ensureSchema();
    const { seeded } = await seedStarterProducts();
    return NextResponse.json({
      ok: true,
      message: seeded
        ? `Database is ready. ${seeded} starter products were added.`
        : 'Database schema is ready.',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to set up database schema.' },
      { status: 500 }
    );
  }
}
