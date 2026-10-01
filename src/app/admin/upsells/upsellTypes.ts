import { UPSELL_CSV_EXAMPLE } from '@/lib/upsellCsv';
import type { Product } from '@/data/products';

// Moved out of page.tsx unchanged: the upsell types, the CSV example download and
// the two small product helpers. Only the word `export` was added.

export interface UpsellRule {
  id: number;
  trigger_handle: string;
  upsell_handle: string;
  priority: number;
  custom_message: string | null;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface ManualOverride {
  trigger_handle: string;
  heading: string | null;
  basket_heading: string | null;
  upsell_handles: string[];
  updated_at: string;
}

export interface LastImport {
  at: string;
  mode: 'replace' | 'append';
  totalRules: number;
  totalProducts: number;
  totalErrors: number;
}

export interface UpsellSettings {
  enabled: boolean;
  lastImport: LastImport | null;
}

export interface RowError {
  row: number;
  reason: string;
  raw: string;
  kind?: 'duplicate' | 'unknown_handle';
}

export interface PreviewRule {
  row: number;
  triggerHandle: string;
  triggerName: string;
  upsellHandle: string;
  upsellName: string;
  priority: number;
  active: boolean;
  customMessage: string | null;
}

export interface RecognizedProduct {
  slug: string;
  name: string;
}

export interface PreviewResult {
  preview?: true;
  mode?: 'replace' | 'append';
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  rules?: PreviewRule[];
  recognizedProducts?: RecognizedProduct[];
  errors?: RowError[];
  error?: string;
}

export interface ImportResult {
  imported?: number;
  errors?: RowError[];
  summary?: LastImport;
  error?: string;
}

export interface EffectiveRecommendation {
  slug: string;
  name: string;
}


export function downloadExampleCsv() {
  const blob = new Blob([UPSELL_CSV_EXAMPLE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'upsell-rules-example.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export const MAX_MANUAL_UPSELLS = 8;

export function startingPrice(p: Product): number {
  return Math.min(...p.variants.map(v => v.price));
}
