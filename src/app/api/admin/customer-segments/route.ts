import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import {
  findCustomers,
  listSegmentFacets,
  segmentProducts,
  type CustomerFilters,
} from '@/lib/db/customerSegments';

// Behind the Find Customers screen (task c22cb6cb).
//
// One call answers the whole screen: the drop-down options, who matches, and what that group buys.
// Three round trips for one button press would make every filter change feel slow, and the three
// answers are always wanted together.
//
// It only ever READS. Everything that acts on the result, emailing or exporting, is done by the
// screen through systems that already exist.
//
// Everything under /api/admin is already behind the admin session cookie in src/proxy.ts.

export const dynamic = 'force-dynamic';

function text(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  return value && value.trim() ? value.trim() : null;
}

/** Only 'yes' or 'no' get through; anything else means the filter was not set. */
function yesNo(params: URLSearchParams, key: string): 'yes' | 'no' | null {
  const value = text(params, key);
  return value === 'yes' || value === 'no' ? value : null;
}

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'The database is not connected, so nobody could be looked up.' },
      { status: 503 }
    );
  }

  const params = new URL(request.url).searchParams;
  const minSpendRaw = text(params, 'minSpend');
  const minSpend = minSpendRaw !== null ? Number(minSpendRaw) : null;

  const filters: CustomerFilters = {
    joinedFrom: text(params, 'joinedFrom'),
    joinedTo: text(params, 'joinedTo'),
    referredBy: text(params, 'referredBy'),
    referredByContains: text(params, 'referredByContains'),
    campaign: text(params, 'campaign'),
    town: text(params, 'town'),
    postcodeStart: text(params, 'postcodeStart'),
    boughtProduct: text(params, 'boughtProduct'),
    hasOrdered: yesNo(params, 'hasOrdered'),
    minSpend: minSpend !== null && Number.isFinite(minSpend) ? minSpend : null,
    marketingConsent: yesNo(params, 'marketingConsent'),
    emailVerified: yesNo(params, 'emailVerified'),
  };

  try {
    const [facets, customers] = await Promise.all([
      listSegmentFacets(),
      findCustomers(filters),
    ]);
    // What the people on screen buy, rather than a shop-wide report with a filter on it.
    const products = await segmentProducts(customers.map((c) => c.id)).catch(() => []);

    return NextResponse.json({
      facets,
      customers,
      products,
      total: customers.length,
      reachable: customers.filter((c) => c.canBeEmailed).length,
    });
  } catch {
    return NextResponse.json(
      { error: 'The search could not run just now. Please try again.' },
      { status: 500 }
    );
  }
}
