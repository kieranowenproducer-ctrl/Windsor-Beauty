import { NextResponse } from 'next/server';
import {
  appendUpsellRules,
  getSiteContent,
  isDbConfigured,
  listCustomProducts,
  replaceUpsellRules,
  upsertSiteContent,
  type UpsellRuleInput,
} from '@/lib/db';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';
import { parseUpsellCsv, type UpsellCsvRow, type UpsellCsvRowError } from '@/lib/upsellCsv';
import { parseUpsellSettings } from '@/lib/upsells';

export const dynamic = 'force-dynamic';

const MAX_CSV_LENGTH = 2_000_000; // ~2MB of text — generous for a relationship file, cheap to reject before parsing

interface PreviewRule {
  row: number;
  triggerHandle: string;
  triggerName: string;
  upsellHandle: string;
  upsellName: string;
  priority: number;
  active: boolean;
  customMessage: string | null;
  startDate: string | null;
  endDate: string | null;
}

// Admin CSV import — the only place CSV text is ever parsed. Everything the
// storefront reads afterwards (src/app/api/upsells/route.ts) comes from the
// already-structured upsell_rules table, never from re-parsing this file.
//
// Safety model: the CSV is fully parsed and validated (structurally, then
// against the live product catalogue) entirely in memory before anything
// touches the database. If nothing usable comes out of that, the existing
// rules are left completely untouched and a clear error is returned —
// "leave existing working upsell rules untouched until a successful import"
// is enforced here, not assumed.
//
// `dryRun: true` runs every validation step below but returns before the DB
// write (and before the lastImport settings update) — this is what powers
// the admin UI's "Preview Import" step. It doesn't require a configured DB:
// validating against the static catalogue alone is still useful, and
// `listCustomProducts()` already degrades to an empty override map on its
// own failure.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const csv = typeof body.csv === 'string' ? body.csv : '';
  const mode = body.mode === 'append' ? 'append' : 'replace';
  const dryRun = body.dryRun === true;

  if (!dryRun && !isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  if (!csv.trim()) {
    return NextResponse.json({ error: 'No CSV content was provided.' }, { status: 400 });
  }
  if (csv.length > MAX_CSV_LENGTH) {
    return NextResponse.json({ error: 'File is too large.' }, { status: 400 });
  }

  const parsed = parseUpsellCsv(csv);
  if (parsed.fatalError) {
    return NextResponse.json({ error: parsed.fatalError }, { status: 400 });
  }

  // Cross-check every structurally-valid row against the real catalogue
  // (static PRODUCTS + admin-created/edited overrides) — a handle that
  // doesn't match any known product slug is reported as an error and
  // excluded, same as any other invalid row, rather than silently imported
  // as a rule that can never fire.
  let overrides: Record<string, Product> = {};
  try {
    overrides = await listCustomProducts();
  } catch {
    // Falls through with an empty overrides map — static catalogue alone is
    // still a perfectly valid set to validate against.
  }
  const catalogue = mergeProducts(PRODUCTS, overrides);
  const knownSlugs = new Set(catalogue.map(p => p.slug));
  const nameOf = (slug: string) => catalogue.find(p => p.slug === slug)?.name ?? slug;

  const totalDataRows = parsed.rows.length + parsed.errors.length;
  const errors: UpsellCsvRowError[] = [...parsed.errors];
  const validRows: UpsellCsvRow[] = [];
  parsed.rows.forEach(row => {
    const unknown: string[] = [];
    if (!knownSlugs.has(row.triggerHandle)) unknown.push(`trigger "${row.triggerHandle}"`);
    if (!knownSlugs.has(row.upsellHandle)) unknown.push(`upsell "${row.upsellHandle}"`);
    if (unknown.length > 0) {
      errors.push({
        row: row.sourceRow,
        reason: `Unknown product handle — ${unknown.join(' and ')} do not match any product in the catalogue. Use "Export Product Handles CSV" on the Products page to get the exact current handles.`,
        raw: `${row.triggerHandle},${row.upsellHandle}`,
        kind: 'unknown_handle',
      });
      return;
    }
    validRows.push(row);
  });
  errors.sort((a, b) => a.row - b.row);

  if (validRows.length === 0) {
    return NextResponse.json({
      error: parsed.rows.length === 0
        ? 'No usable data rows were found in the file.'
        : 'None of the rows in this file matched real products — nothing was imported. Existing upsell rules have not been changed.',
      errors,
    }, { status: 400 });
  }

  const recognizedSlugs = new Set<string>();
  validRows.forEach(r => { recognizedSlugs.add(r.triggerHandle); recognizedSlugs.add(r.upsellHandle); });
  const recognizedProducts = Array.from(recognizedSlugs)
    .map(slug => ({ slug, name: nameOf(slug) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rules: PreviewRule[] = validRows.map(r => ({
    row: r.sourceRow,
    triggerHandle: r.triggerHandle,
    triggerName: nameOf(r.triggerHandle),
    upsellHandle: r.upsellHandle,
    upsellName: nameOf(r.upsellHandle),
    priority: r.priority,
    active: r.active,
    customMessage: r.customMessage,
    startDate: r.startDate,
    endDate: r.endDate,
  }));

  const previewPayload = {
    preview: true as const,
    mode,
    totalRows: totalDataRows,
    validRows: validRows.length,
    invalidRows: errors.length,
    rules,
    recognizedProducts,
    errors,
  };

  if (dryRun) {
    return NextResponse.json(previewPayload);
  }

  const inputs: UpsellRuleInput[] = validRows.map(r => ({
    triggerHandle: r.triggerHandle,
    upsellHandle: r.upsellHandle,
    priority: r.priority,
    customMessage: r.customMessage,
    active: r.active,
    startDate: r.startDate,
    endDate: r.endDate,
  }));

  try {
    const imported = mode === 'append' ? await appendUpsellRules(inputs) : await replaceUpsellRules(inputs);

    const existingSettingsRow = await getSiteContent('upsell-settings').catch(() => null);
    const existingSettings = parseUpsellSettings(existingSettingsRow?.body);
    const summary = {
      at: new Date().toISOString(),
      mode,
      totalRules: imported,
      totalProducts: recognizedProducts.length,
      totalErrors: errors.length,
    };
    await upsertSiteContent(
      'upsell-settings',
      null,
      JSON.stringify({ enabled: existingSettings.enabled, lastImport: summary }),
      null,
      'text'
    );

    return NextResponse.json({ imported, errors, summary, recognizedProducts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed. Existing upsell rules have not been changed.' },
      { status: 500 }
    );
  }
}
