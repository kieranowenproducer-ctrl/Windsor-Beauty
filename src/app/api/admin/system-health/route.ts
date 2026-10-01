import { NextResponse } from 'next/server';
import {
  canResolveAutomationFailures,
  countOpenAutomationFailures,
  countRecentAutomationFailures,
  isDbConfigured,
  listRecentAutomationFailures,
  listUnverifiedCustomers,
} from '@/lib/db';
import { listCronRunStatus } from '@/lib/cronHeartbeat';

export const dynamic = 'force-dynamic';

// GET /api/admin/system-health
// Backs the sidebar badge, the dashboard's red banner and the System Health
// page itself — see logAutomationFailure() in src/lib/db.ts for what writes
// to this table (every previously-silent .catch() across the payment,
// dispatch, invoice-sync and email-sending code paths).
//
// `openCount` is the number that should be shown to a person: genuine faults
// that nobody has ticked off yet. `count24h` is the old rolling count of
// everything, kept because it is still the honest answer to "how busy was the
// last day" and costs nothing to return.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ failures: [], count24h: 0, openCount: 0, canResolve: false, unverified: [], crons: [] });
  }
  try {
    const [failures, count24h, openCount, canResolve, unverified, crons] = await Promise.all([
      listRecentAutomationFailures(200),
      countRecentAutomationFailures(24),
      countOpenAutomationFailures(),
      canResolveAutomationFailures(),
      listUnverifiedCustomers(100),
      listCronRunStatus(),
    ]);
    return NextResponse.json({ failures, count24h, openCount, canResolve, unverified, crons });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load system health.' },
      { status: 500 }
    );
  }
}
