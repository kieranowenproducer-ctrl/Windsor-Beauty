import { NextResponse } from 'next/server';
import { PRODUCTS, mergeProducts } from '@/data/products';
import { getHiddenProductSlugs, isDbConfigured, listCustomProducts } from '@/lib/db';
import { buildDosageAudit, summariseDosageAudit } from '@/lib/pearlDosageAudit';

/**
 * GET /api/admin/pearl/dosages
 *
 * What PEARL holds on the dose of every product on sale, for the Pearl Dosages screen
 * (Kieran, 10 September 2026).
 *
 * WORKED OUT ON EVERY REQUEST, not read from a file that was correct once. The shop changes in the
 * admin: a product added, renamed, withdrawn or given a new strength has to change this report on
 * its own, or it becomes a snapshot nobody can trust and everybody has to remember to refresh.
 * PEARL is deterministic and offline, so the only cost is the catalogue read the shop already does.
 *
 * This is deliberately the ADMIN catalogue, not the public search catalogue. Hidden products are
 * included because a product must have a truthful Pearl answer before somebody switches it live.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [overrides, hidden] = isDbConfigured()
      ? await Promise.all([listCustomProducts(), getHiddenProductSlugs()])
      : [{}, [] as string[]];
    const catalogue = mergeProducts(PRODUCTS, overrides);
    const hiddenSet = new Set(hidden);
    const rows = buildDosageAudit(catalogue).map((row) => ({ ...row, hidden: hiddenSet.has(row.slug) }));
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      total: rows.length,
      hidden: rows.filter((row) => row.hidden).length,
      summary: summariseDosageAudit(rows),
      rows,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not build the dosage report.' },
      { status: 500 },
    );
  }
}
