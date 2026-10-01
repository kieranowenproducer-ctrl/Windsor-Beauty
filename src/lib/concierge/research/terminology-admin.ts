import type {
  PearlTermConfidence,
  PearlTermKind,
  PearlTermStatus,
  PearlTerminologyInput,
} from '@/lib/db/pearlTerminology';

const KINDS = new Set<PearlTermKind>(['alias', 'abbreviation', 'misspelling', 'category', 'ambiguous', 'blend']);
const STATUSES = new Set<PearlTermStatus>(['review', 'approved', 'rejected']);
const CONFIDENCE = new Set<PearlTermConfidence>(['high', 'medium', 'low']);

function strings(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

export function cleanPearlTerminologyInput(body: unknown): { input?: PearlTerminologyInput; error?: string } {
  const value = (body || {}) as Record<string, unknown>;
  const kind = value.kind as PearlTermKind;
  const term = typeof value.term === 'string' ? value.term.trim() : '';
  const canonicalSlug = typeof value.canonicalSlug === 'string' ? value.canonicalSlug.trim() || null : null;
  const displayName = typeof value.displayName === 'string' ? value.displayName.trim() || null : null;
  const aliases = strings(value.aliases);
  const misspellings = strings(value.misspellings);
  const relatedSlugs = strings(value.relatedSlugs);
  const categories = strings(value.categories, 8);
  const componentSlugs = strings(value.componentSlugs);
  const ambiguousWith = strings(value.ambiguousWith);
  const sourceUrls = strings(value.sourceUrls).filter((url) => {
    try { return new URL(url).protocol === 'https:'; } catch { return false; }
  });
  const confidence = value.confidence as PearlTermConfidence;
  const reviewStatus = value.reviewStatus as PearlTermStatus;
  const notes = typeof value.notes === 'string' ? value.notes.trim().slice(0, 1200) || null : null;
  const lastVerified = typeof value.lastVerified === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.lastVerified)
    ? value.lastVerified
    : null;
  /* An edit of a built-in record names the built-in it replaces. Built-in
     ids are plain slugs, so anything else is rejected rather than stored. */
  const supersedesBuiltIn = typeof value.supersedesBuiltIn === 'string' && /^[a-z0-9-]{1,80}$/.test(value.supersedesBuiltIn.trim())
    ? value.supersedesBuiltIn.trim()
    : null;

  if (!KINDS.has(kind) || !term || term.length > 200) return { error: 'Choose a type and enter a term of no more than 200 characters.' };
  if (!STATUSES.has(reviewStatus) || !CONFIDENCE.has(confidence)) return { error: 'Choose a valid review status and confidence.' };
  if (kind === 'blend' && componentSlugs.length < 2) return { error: 'A blend needs at least two approved component slugs.' };
  if (!['blend', 'ambiguous'].includes(kind) && !canonicalSlug) return { error: 'Choose the canonical compound slug for this term.' };
  if (kind === 'ambiguous' && ambiguousWith.length < 1) return { error: 'An ambiguous term needs at least one possible compound slug.' };
  if (kind === 'category' && Array.from(new Set([canonicalSlug, ...ambiguousWith].filter(Boolean))).length < 2) {
    return { error: 'A category needs at least two approved compounds.' };
  }

  return {
    input: {
      kind,
      term,
      canonicalSlug,
      displayName,
      aliases,
      misspellings,
      relatedSlugs,
      categories,
      componentSlugs,
      ambiguousWith,
      sourceUrls,
      supersedesBuiltIn,
      confidence,
      reviewStatus,
      autoResolve: !['ambiguous', 'category'].includes(kind) && value.autoResolve === true,
      enabled: value.enabled !== false,
      notes,
      lastVerified,
    },
  };
}

export function pearlTermKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^a-z0-9]+/g, '');
}

export function pearlInputTerms(input: PearlTerminologyInput): string[] {
  return Array.from(new Set([input.term, ...input.aliases, ...input.misspellings]
    .map(pearlTermKey)
    .filter(Boolean)));
}
