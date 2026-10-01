import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import {
  backfillEarlierIpActivity, listConcerns, listIpSummary, listPlaces, listIpActivity,
} from '@/lib/db/ipActivity';
import { listBannedCustomers, listBannedIpMatches } from '@/lib/db/bans';
import { getTrackingHealth, listRecentVisits, listVisitSources, listVisitorAddresses } from '@/lib/db/siteVisits';
import { listCheckoutFunnel, listDemand, listDemandTrends, listVisitorJourneys } from '@/lib/db/siteDemand';
import { resolvePageNames } from '@/lib/ads/pageLabels';

export const dynamic = 'force-dynamic';

/** Runs a query; if it fails because the schema is behind, creates the schema and tries once more. */
async function selfHealing<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch {
    try {
      await ensureSchema();
      return await read();
    } catch (err) {
      console.error('[admin/ip-addresses] ban data unavailable:', err);
      return [];
    }
  }
}

async function selfHealingOne<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    try {
      await ensureSchema();
      return await read();
    } catch (err) {
      console.error('[admin/ip-addresses] demand data unavailable:', err);
      return null;
    }
  }
}

// Admin gating is handled by src/proxy.ts, which covers every /api/admin
// route. No cookie check is repeated here, matching the other admin endpoints.
export async function GET(request: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  // The admin Dashboard only wants one number from this page: how many
  // banned people have come back under a new account. Until 26 September
  // 2026 it downloaded this route's ENTIRE answer (every address, visit,
  // journey and trend) just to count one list. This scope answers with the
  // count alone, skipping the backfill and the thirteen other reads.
  if (request.nextUrl.searchParams.get('scope') === 'banned-count') {
    const bannedMatches = await selfHealing(listBannedIpMatches);
    return NextResponse.json({ bannedCount: bannedMatches.length });
  }

  const daysRaw = Number(request.nextUrl.searchParams.get('days') ?? 30);
  const days = [1, 7, 30, 90, 730].includes(daysRaw) ? daysRaw : 30;
  const load = async () => {
    // Seeding the addresses the site was already recording is a convenience, not
    // the feature. If the database role cannot write (the local role is read-only
    // by design) the page must still open, so a failure here is stepped over.
    await backfillEarlierIpActivity().catch((err) => {
      console.error('[admin/ip-addresses] backfill skipped:', err);
      return 0;
    });
    const [addresses, places, concerns, recent, banned, bannedMatches, visits, visitSources, visitors, demand, trends, journeys, checkoutFunnel, trackingHealth] = await Promise.all([
      listIpSummary(),
      listPlaces(),
      listConcerns(),
      listIpActivity(500),
      // Banned accounts and the flag (task 9cd55f28). On the first load after this ships the ban
      // columns do not exist yet, so each one creates the schema and tries again, and only then
      // gives up empty. Swallowing the error without that retry would leave the ban button broken
      // until somebody thought to press Run Database Setup.
      selfHealing(listBannedCustomers),
      selfHealing(listBannedIpMatches),
      // Visits (task dfe5e9ae). Same self-healing: the table appears with the
      // first visit or the first open of this page, whichever is sooner.
      selfHealing(() => listRecentVisits(300)),
      selfHealing(() => listVisitSources(30)),
      selfHealing(() => listVisitorAddresses(300)),
      selfHealingOne(() => listDemand(days)),
      selfHealingOne(listDemandTrends),
      selfHealing(() => listVisitorJourneys(days, 100)),
      selfHealingOne(() => listCheckoutFunnel(days)),
      selfHealingOne(getTrackingHealth),
    ]);
    const pageNames = await resolvePageNames([
      ...(demand?.products ?? []).map((product) => product.path),
      ...journeys.flatMap((journey) => journey.steps.map((step) => step.path)),
    ]).catch(() => ({}));
    return { addresses, places, concerns, recent, banned, bannedMatches, visits, visitSources, visitors, demand, trends, journeys, checkoutFunnel, trackingHealth, pageNames };
  };

  try {
    return NextResponse.json(await load());
  } catch {
    // Same self-healing pattern as the other admin routes: the first call after
    // this ships runs before the table exists, so create it and retry once
    // rather than making anyone run a migration by hand.
    try {
      await ensureSchema();
      return NextResponse.json(await load());
    } catch (err) {
      console.error('[admin/ip-addresses] GET failed after ensureSchema:', err);
      return NextResponse.json({ error: 'Could not load the address log.' }, { status: 500 });
    }
  }
}
