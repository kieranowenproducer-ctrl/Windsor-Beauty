// CSV parsing + structural validation for the admin Upsell System
// (/admin/upsells). Deliberately knows nothing about the live product
// catalogue or database — that cross-check (does this handle actually exist,
// is it disabled/hidden) happens one layer up, in the import API route,
// which has access to both. Keeping this file pure makes it independently
// testable and keeps "is this CSV well-formed" separate from "does this CSV
// match today's catalogue".
//
// Required columns: trigger_product_handle, upsell_product_handle, priority, active
// Optional columns: custom_message, start_date, end_date (future-proofing for
// seasonal/temporary upsells — accepted now, enforced at recommendation time
// once a real campaign needs them).

export interface UpsellCsvRow {
  /** 1-based row number in the original file, header counted as row 1 — carried through so a later catalogue cross-check (or an import preview) can still point back at the right line. */
  sourceRow: number;
  triggerHandle: string;
  upsellHandle: string;
  priority: number;
  customMessage: string | null;
  active: boolean;
  /** 'YYYY-MM-DD', or null for no limit. */
  startDate: string | null;
  endDate: string | null;
}

export interface UpsellCsvRowError {
  /** 1-based data row number (the header is not counted), matches what a spreadsheet user would call "row 2", "row 3", etc. when counting the header as row 1. */
  row: number;
  reason: string;
  raw: string;
  /** Lets callers (the import preview) bucket errors without re-parsing `reason` text. Absent means a generic structural error (bad priority, bad active flag, missing field, bad date). 'unknown_handle' is tagged one layer up, in the import route, since this file has no catalogue access. */
  kind?: 'duplicate' | 'unknown_handle';
}

export interface ParsedUpsellCsv {
  rows: UpsellCsvRow[];
  errors: UpsellCsvRowError[];
  /** Set only when the whole file is unusable (e.g. missing required columns) — nothing was parsed, nothing should be imported. */
  fatalError: string | null;
}

export const UPSELL_REQUIRED_COLUMNS = ['trigger_product_handle', 'upsell_product_handle', 'priority', 'active'] as const;
export const UPSELL_OPTIONAL_COLUMNS = ['custom_message', 'start_date', 'end_date'] as const;

export const UPSELL_CSV_HEADER = 'trigger_product_handle,upsell_product_handle,priority,custom_message,active,start_date,end_date';

// An example of the layout only. The handles below are placeholders, not real
// products: swap them for handles from "Export Product Handles CSV" on
// /admin/products before uploading, or the import preview will reject the rows.
export const UPSELL_CSV_EXAMPLE = `${UPSELL_CSV_HEADER}
first-product-handle,second-product-handle,1,Goes well with this product,TRUE,,
first-product-handle,third-product-handle,2,,TRUE,,
second-product-handle,first-product-handle,1,Often bought together,TRUE,,
third-product-handle,first-product-handle,1,,TRUE,,
`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Minimal RFC-4180-ish line splitter — handles quoted fields containing
// commas (e.g. a custom_message like "Great value, buy together") and
// doubled-quote escaping (""), without pulling in a CSV dependency for
// something this small and admin-controlled.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

// Forgiving but explicit — TRUE/FALSE (case-insensitive) plus the common
// 1/0/yes/no spreadsheet variants. Anything else (including blank) is
// treated as unparseable so the row is reported rather than silently
// defaulted one way or the other.
function parseActiveFlag(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return null;
}

export function parseUpsellCsv(text: string): ParsedUpsellCsv {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: [], fatalError: 'The file is empty.' };
  }

  const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const colIndex: Record<string, number> = {};
  header.forEach((name, i) => { colIndex[name] = i; });

  const missingColumns = UPSELL_REQUIRED_COLUMNS.filter(col => !(col in colIndex));
  if (missingColumns.length > 0) {
    // A common mix-up: uploading the "Export Product Handles CSV" reference
    // file (product_name,product_handle,sku,status — see admin/products)
    // into this importer instead of building a separate upsell-rules file
    // from its handles. Detect that specific shape and say so directly,
    // rather than just listing the columns that are missing.
    if ('product_handle' in colIndex && !('trigger_product_handle' in colIndex)) {
      return {
        rows: [],
        errors: [],
        fatalError: `This looks like the "Export Product Handles CSV" reference file (it has a product_handle column), not an upsell rules file. Use the handles from that file's product_handle column to build a separate CSV with these columns instead: ${UPSELL_REQUIRED_COLUMNS.join(', ')}.`,
      };
    }
    return {
      rows: [],
      errors: [],
      fatalError: `Missing required column(s): ${missingColumns.join(', ')}. Expected at least: ${UPSELL_REQUIRED_COLUMNS.join(', ')}.`,
    };
  }

  const rows: UpsellCsvRow[] = [];
  const errors: UpsellCsvRowError[] = [];
  const seenPairs = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const rowNum = i + 1; // counts the header as row 1, matching a spreadsheet's row numbers
    const fields = splitCsvLine(raw);

    const triggerHandle = normalizeHandle(fields[colIndex.trigger_product_handle] ?? '');
    const upsellHandle = normalizeHandle(fields[colIndex.upsell_product_handle] ?? '');
    const priorityRaw = (fields[colIndex.priority] ?? '').trim();
    const activeRaw = fields[colIndex.active] ?? '';
    const customMessageRaw = colIndex.custom_message !== undefined ? (fields[colIndex.custom_message] ?? '').trim() : '';
    const startDateRaw = colIndex.start_date !== undefined ? (fields[colIndex.start_date] ?? '').trim() : '';
    const endDateRaw = colIndex.end_date !== undefined ? (fields[colIndex.end_date] ?? '').trim() : '';

    if (!triggerHandle || !upsellHandle) {
      errors.push({ row: rowNum, reason: 'Missing trigger_product_handle or upsell_product_handle.', raw });
      continue;
    }

    if (triggerHandle === upsellHandle) {
      errors.push({ row: rowNum, reason: `A product cannot upsell itself ("${triggerHandle}").`, raw });
      continue;
    }

    const priority = Number(priorityRaw);
    if (!Number.isInteger(priority) || priority < 1) {
      errors.push({ row: rowNum, reason: `Invalid priority "${priorityRaw}" — must be a whole number of 1 or higher.`, raw });
      continue;
    }

    const active = parseActiveFlag(activeRaw);
    if (active === null) {
      errors.push({ row: rowNum, reason: `Invalid active value "${activeRaw}" — expected TRUE or FALSE.`, raw });
      continue;
    }

    if (startDateRaw && !DATE_PATTERN.test(startDateRaw)) {
      errors.push({ row: rowNum, reason: `Invalid start_date "${startDateRaw}" — expected YYYY-MM-DD.`, raw });
      continue;
    }
    if (endDateRaw && !DATE_PATTERN.test(endDateRaw)) {
      errors.push({ row: rowNum, reason: `Invalid end_date "${endDateRaw}" — expected YYYY-MM-DD.`, raw });
      continue;
    }

    const pairKey = `${triggerHandle}::${upsellHandle}`;
    if (seenPairs.has(pairKey)) {
      errors.push({ row: rowNum, reason: `Duplicate relationship — "${triggerHandle}" → "${upsellHandle}" already appears earlier in this file. Kept the first occurrence.`, raw, kind: 'duplicate' });
      continue;
    }
    seenPairs.add(pairKey);

    rows.push({
      sourceRow: rowNum,
      triggerHandle,
      upsellHandle,
      priority,
      customMessage: customMessageRaw || null,
      active,
      startDate: startDateRaw || null,
      endDate: endDateRaw || null,
    });
  }

  return { rows, errors, fatalError: null };
}
