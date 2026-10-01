import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import { backfillEarlierLogins, listMemberLogins } from '@/lib/db/memberLogins';

export const dynamic = 'force-dynamic';

// Admin gating is handled by src/proxy.ts, which covers every /api/admin
// route. No cookie check is repeated here, matching the other admin endpoints.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const load = async () => {
    // Seeding past sign-ins is a convenience, not the feature. If the database
    // role cannot write (the local role is read-only by design) the log must
    // still be readable, so a failure here is logged and stepped over.
    await backfillEarlierLogins().catch((err) => {
      console.error('[admin/member-logins] backfill skipped:', err);
      return 0;
    });
    return listMemberLogins();
  };

  try {
    return NextResponse.json({ logins: await load() });
  } catch {
    // Same self-healing pattern as /api/admin/enquiries: the first call after
    // this feature ships runs before the table exists, so create it and retry
    // once rather than making anyone run a migration by hand.
    try {
      await ensureSchema();
      return NextResponse.json({ logins: await load() });
    } catch (err) {
      console.error('[admin/member-logins] GET failed after ensureSchema:', err);
      return NextResponse.json({ error: 'Could not load the sign-in log.' }, { status: 500 });
    }
  }
}
