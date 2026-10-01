import { NextRequest, NextResponse } from 'next/server';
import { listCustomProducts, listCustomProductsUpdatedAt, upsertCustomProduct, isDbConfigured } from '@/lib/db';
import { PRODUCTS, mergeProducts } from '@/data/products';
import type { Product, ProductCertificate } from '@/data/products';

export const dynamic = 'force-dynamic';

// ProductCertificate extended with the import-tracking timestamp added on write.
type CertWithTimestamp = ProductCertificate & { certificateDataUpdatedAt?: string };

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildExportRow(product: Product): string {
  const cert = product.certificate as CertWithTimestamp | undefined;
  return [
    csvEscape(product.slug),
    csvEscape(product.name),
    cert !== undefined ? String(cert.enabled) : '',
    csvEscape(cert?.certificateId ?? ''),
    csvEscape(cert?.productName ?? ''),
    csvEscape(cert?.casNumber ?? ''),
    csvEscape(cert?.pubchemCid ?? ''),
    csvEscape(cert?.molecularFormula ?? ''),
    csvEscape(cert?.molecularWeight ?? ''),
    csvEscape(cert?.storage ?? ''),
    csvEscape(cert?.caution ?? ''),
    csvEscape(cert?.mode ?? ''),
    csvEscape(cert?.testRows?.length ? JSON.stringify(cert.testRows) : ''),
    csvEscape(cert?.verificationSummary?.length ? JSON.stringify(cert.verificationSummary) : ''),
    csvEscape(cert?.analyticalResults?.length ? JSON.stringify(cert.analyticalResults) : ''),
    csvEscape(cert?.certificateDataUpdatedAt ?? ''),
  ].join(',');
}

/**
 * Parses a CSV string into a 2-D array of strings.
 * Handles RFC 4180 quoting: fields wrapped in double-quotes may contain
 * commas and newlines; a double-quote inside a quoted field is escaped as "".
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i += 2;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Flush the last field / row
  row.push(field);
  if (row.some(f => f !== '')) rows.push(row);

  return rows;
}

// ─── GET — export certificate data CSV ───────────────────────────────────────

export async function GET() {
  let overrides: Record<string, Product> = {};

  if (isDbConfigured()) {
    try {
      overrides = await listCustomProducts();
      // listCustomProductsUpdatedAt() is intentionally not used here —
      // certificate_data_updated_at is read from the cert object itself.
      await listCustomProductsUpdatedAt().catch(() => {});
    } catch {
      // Fall through — export static products only
    }
  }

  const catalogue = mergeProducts(PRODUCTS, overrides);
  const header = 'slug,product_name,certificate_enabled,certificate_id,display_name,cas_number,pubchem_cid,molecular_formula,molecular_weight,storage,caution,mode,test_rows,verification_summary,analytical_results,certificate_data_updated_at';
  const lines = [header, ...catalogue.map(buildExportRow)].join('\n');
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(lines, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="certificate-data-${today}.csv"`,
    },
  });
}

// ─── POST — import certificate data CSV ──────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Could not parse form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file was chosen. Please pick a CSV file and try again.' },
      { status: 400 },
    );
  }

  const text = await file.text();
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch {
    return NextResponse.json({ error: 'Could not parse CSV file' }, { status: 400 });
  }

  if (rows.length < 2) {
    return NextResponse.json({ error: 'CSV has no data rows' }, { status: 400 });
  }

  // Build column index from the header row
  const header = rows[0].map(h => h.trim());
  const col: Record<string, number> = Object.fromEntries(header.map((h, i) => [h, i]));

  if (!('slug' in col)) {
    return NextResponse.json({ error: 'CSV must have a "slug" column' }, { status: 400 });
  }

  // Load the current merged catalogue so we can compare and preserve non-cert fields
  const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
  const catalogue = mergeProducts(PRODUCTS, overrides);
  const catalogueMap = new Map<string, Product>(catalogue.map(p => [p.slug, p]));

  const getCol = (row: string[], name: string): string =>
    col[name] !== undefined ? (row[col[name]]?.trim() ?? '') : '';

  const parseJsonField = (val: string): unknown => {
    if (!val) return undefined;
    try { return JSON.parse(val); } catch { return undefined; }
  };

  let processed = 0;
  let updated = 0;
  let unchanged = 0;
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  const dataRows = rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.length === 0 || (row.length === 1 && row[0].trim() === '')) continue;

    processed++;
    const slug = getCol(row, 'slug');

    if (!slug) {
      errors.push(`Row ${i + 2}: missing slug`);
      skipped++;
      continue;
    }

    const product = catalogueMap.get(slug);
    if (!product) {
      errors.push(`Row ${i + 2}: slug "${slug}" not found in catalogue`);
      skipped++;
      continue;
    }

    // Determine whether this row carries any certificate data
    const certEnabled = getCol(row, 'certificate_enabled');
    const certId = getCol(row, 'certificate_id');
    const hasCertData = certEnabled !== '' || certId !== '';

    if (!hasCertData) {
      unchanged++;
      continue;
    }

    const existingCert = product.certificate as CertWithTimestamp | undefined;
    const hasExistingCert = existingCert !== undefined;

    const modeRaw = getCol(row, 'mode');
    const newCertFields = {
      enabled:             certEnabled === 'true',
      certificateId:       certId,
      productName:         getCol(row, 'display_name')       || undefined,
      casNumber:           getCol(row, 'cas_number')         || undefined,
      pubchemCid:          getCol(row, 'pubchem_cid')        || undefined,
      molecularFormula:    getCol(row, 'molecular_formula')  || undefined,
      molecularWeight:     getCol(row, 'molecular_weight')   || undefined,
      storage:             getCol(row, 'storage')            || undefined,
      caution:             getCol(row, 'caution')            || undefined,
      mode:                (modeRaw as 'template' | 'external' | undefined) || undefined,
      testRows:            (parseJsonField(getCol(row, 'test_rows')) as ProductCertificate['testRows']) ?? [],
      verificationSummary: (parseJsonField(getCol(row, 'verification_summary')) as ProductCertificate['verificationSummary']) || undefined,
      analyticalResults:   (parseJsonField(getCol(row, 'analytical_results')) as ProductCertificate['analyticalResults']) || undefined,
    };

    // Compare only the CSV-covered fields — skip certificateDataUpdatedAt, image, externalImages
    const certChanged = (() => {
      if (!existingCert) return true;
      return (
        existingCert.enabled !== newCertFields.enabled ||
        existingCert.certificateId !== newCertFields.certificateId ||
        (existingCert.productName ?? undefined) !== newCertFields.productName ||
        (existingCert.casNumber ?? undefined) !== newCertFields.casNumber ||
        (existingCert.pubchemCid ?? undefined) !== newCertFields.pubchemCid ||
        (existingCert.molecularFormula ?? undefined) !== newCertFields.molecularFormula ||
        (existingCert.molecularWeight ?? undefined) !== newCertFields.molecularWeight ||
        (existingCert.storage ?? undefined) !== newCertFields.storage ||
        (existingCert.caution ?? undefined) !== newCertFields.caution ||
        (existingCert.mode ?? undefined) !== newCertFields.mode ||
        JSON.stringify(existingCert.testRows ?? []) !== JSON.stringify(newCertFields.testRows) ||
        JSON.stringify(existingCert.verificationSummary ?? null) !== JSON.stringify(newCertFields.verificationSummary ?? null) ||
        JSON.stringify(existingCert.analyticalResults ?? null) !== JSON.stringify(newCertFields.analyticalResults ?? null)
      );
    })();

    if (!certChanged) {
      unchanged++;
      continue;
    }

    // Build the merged certificate: preserve fields not in the CSV (image, externalImages)
    const mergedCert: CertWithTimestamp = {
      ...(existingCert ?? {}),
      ...newCertFields,
      certificateDataUpdatedAt: new Date().toISOString(),
    };

    const updatedProduct: Product = {
      ...product,
      certificate: mergedCert as ProductCertificate,
    };

    try {
      await upsertCustomProduct(updatedProduct);
      if (hasExistingCert) {
        updated++;
      } else {
        added++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Database error';
      errors.push(`Row ${i + 2} (${slug}): ${msg}`);
    }
  }

  return NextResponse.json({ processed, updated, unchanged, added, skipped, errors });
}
