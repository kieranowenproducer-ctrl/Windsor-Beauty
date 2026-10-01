import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { countRecent, listDuplicateSignals } from '@/lib/db/duplicateAccounts';

// Behind the two "Check for second accounts" buttons, and behind the dashboard's red banner
// (task c76f31fb).
//
// Everything under /api/admin is already behind the admin session cookie in src/proxy.ts, so there
// is no separate check here.
//
// IT ONLY LOOKS. It writes nothing, emails nobody and blocks no one, so pressing the button twice
// costs nothing but a moment. The email and the red row are raised by the automatic check at
// sign-up instead: a button that emailed would send forty notes the first time anybody pressed it.

export const dynamic = 'force-dynamic';

export async function GET() {
  // A CHECK THAT COULD NOT RUN IS NOT A CLEAN BILL OF HEALTH. This returned a plain count of 0
  // with no database, which every screen reading it would have shown as "nothing to worry about" —
  // found by actually calling it rather than by reading it. Both failures now answer with an error
  // and no count, so there is nothing for a caller to mistake for an all-clear.
  if (!isDbConfigured()) {
    return NextResponse.json(
      { dbConfigured: false, error: 'The database is not connected, so nothing could be checked.' },
      { status: 503 }
    );
  }

  try {
    const findings = await listDuplicateSignals();
    // `count` is everything, for the list behind the button. `recentCount` is what the dashboard
    // warning shows, so an old household pairing does not leave a red banner up for ever.
    return NextResponse.json({
      dbConfigured: true,
      findings,
      count: findings.length,
      recentCount: countRecent(findings),
    });
  } catch {
    return NextResponse.json(
      { dbConfigured: true, error: 'The check could not run just now. Please try again shortly.' },
      { status: 500 }
    );
  }
}
