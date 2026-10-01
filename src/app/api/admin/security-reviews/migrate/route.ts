import { NextResponse } from 'next/server';
import { migrateLegacySecurityReviews } from '@/lib/db/securityReviewMigration';

export async function POST() {
  try {
    return NextResponse.json(await migrateLegacySecurityReviews());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Security review migration failed.' }, { status: 500 });
  }
}
