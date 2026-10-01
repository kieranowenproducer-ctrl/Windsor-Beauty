import { requireDb } from './client';

export type PearlTermKind = 'alias' | 'abbreviation' | 'misspelling' | 'category' | 'ambiguous' | 'blend';
export type PearlTermStatus = 'review' | 'approved' | 'rejected';
export type PearlTermConfidence = 'high' | 'medium' | 'low';

export interface PearlTerminologyRow {
  id: number;
  kind: PearlTermKind;
  term: string;
  canonical_slug: string | null;
  display_name: string | null;
  aliases: string[];
  misspellings: string[];
  related_slugs: string[];
  categories: string[];
  component_slugs: string[];
  ambiguous_with: string[];
  source_urls: unknown;
  confidence: PearlTermConfidence;
  review_status: PearlTermStatus;
  auto_resolve: boolean;
  enabled: boolean;
  notes: string | null;
  last_verified: string | null;
  created_by: string | null;
  updated_by: string | null;
  supersedes_builtin: string | null;
  archived_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PearlTerminologyInput {
  kind: PearlTermKind;
  term: string;
  canonicalSlug: string | null;
  displayName: string | null;
  aliases: string[];
  misspellings: string[];
  relatedSlugs: string[];
  categories: string[];
  componentSlugs: string[];
  ambiguousWith: string[];
  sourceUrls: string[];
  confidence: PearlTermConfidence;
  reviewStatus: PearlTermStatus;
  autoResolve: boolean;
  enabled: boolean;
  notes: string | null;
  lastVerified: string | null;
  /* The id of the built-in record this row replaces, when it is an edit of
     one. Null for an ordinary administrator-added term. */
  supersedesBuiltIn: string | null;
}

function sourceList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && /^https:\/\//i.test(item));
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'reviewed link';
  }
}

export function pearlRowToRuntimeRecord(row: PearlTerminologyRow) {
  const sources = sourceList(row.source_urls).map((url) => ({
    label: `Administrator source: ${sourceHost(url)}`,
    url,
    role: 'Administrator-reviewed terminology source',
  }));
  const base = {
    id: `admin-${row.id}`,
    /* When this row is an EDIT of a built-in record, it names the built-in
       it replaces. The resolver drops that built-in so the edit stands in
       its place rather than sitting alongside it. */
    supersedesBuiltIn: row.supersedes_builtin || null,
    sources,
    confidence: row.confidence,
    reviewStatus: row.review_status,
    autoResolve: row.auto_resolve,
    enabled: row.enabled,
    lastVerified: row.last_verified || 'Not verified',
    notes: row.notes || 'Administrator-maintained terminology record.',
  };

  if (row.kind === 'blend') {
    return {
      ...base,
      recordType: 'blend',
      canonicalName: row.display_name || row.term,
      aliases: Array.from(new Set([
        ...(row.aliases || []),
        ...(row.display_name && row.display_name !== row.term ? [row.term] : []),
      ])),
      misspellings: row.misspellings || [],
      components: row.component_slugs,
      profileSlug: '',
      compositionFixed: false,
      conflicts: ['Administrator-maintained mapping. Confirm the exact formulation in the cited source.'],
    };
  }

  return {
    ...base,
    recordType: row.kind === 'ambiguous' || row.kind === 'category' ? 'ambiguous' : 'compound',
    canonicalSlug: row.canonical_slug || '',
    displayName: row.display_name || row.term,
    aliases: Array.from(new Set([
      ...(row.aliases || []),
      ...(['alias', 'ambiguous', 'category'].includes(row.kind) ? [row.term] : []),
    ])),
    abbreviations: row.kind === 'abbreviation' ? [row.term] : [],
    misspellings: Array.from(new Set([
      ...(row.misspellings || []),
      ...(row.kind === 'misspelling' ? [row.term] : []),
    ])),
    phoneticForms: [],
    relatedSlugs: row.related_slugs || [],
    ambiguousWith: row.ambiguous_with,
  };
}

export async function listPearlTerminology(): Promise<PearlTerminologyRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM pearl_terminology_overrides
    WHERE archived_at IS NULL
    ORDER BY review_status = 'review' DESC, updated_at DESC, id DESC
  `;
  return rows as PearlTerminologyRow[];
}

export async function listApprovedPearlTerminology() {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM pearl_terminology_overrides
    WHERE review_status = 'approved' AND enabled = TRUE AND archived_at IS NULL
    ORDER BY id ASC
  `;
  return (rows as PearlTerminologyRow[]).map(pearlRowToRuntimeRecord);
}

/** When `proposalId` is set the row is stamped with it under a uniqueness
 *  rule (Pearl repairs Stage D): a retried approval finds the rule it
 *  already wrote, returns null, and duplicates nothing. */
export async function createPearlTerminology(input: PearlTerminologyInput, actor: string | null = null, proposalId: number | null = null): Promise<PearlTerminologyRow | null> {
  const db = requireDb();
  const encodedSources = JSON.stringify(input.sourceUrls);
  const rows = await db`
    INSERT INTO pearl_terminology_overrides
      (kind, term, canonical_slug, display_name, aliases, misspellings, related_slugs,
       categories, component_slugs, ambiguous_with,
       source_urls, confidence, review_status, auto_resolve, enabled, notes, last_verified,
       created_by, updated_by, proposal_id, supersedes_builtin)
    VALUES
      (${input.kind}, ${input.term}, ${input.canonicalSlug}, ${input.displayName},
       ${input.aliases}::text[], ${input.misspellings}::text[], ${input.relatedSlugs}::text[],
       ${input.categories}::text[],
       ${input.componentSlugs}::text[], ${input.ambiguousWith}::text[], ${encodedSources}::jsonb,
       ${input.confidence}, ${input.reviewStatus}, ${input.autoResolve}, ${input.enabled},
       ${input.notes}, ${input.lastVerified}::date, ${actor}, ${actor}, ${proposalId}, ${input.supersedesBuiltIn})
    ON CONFLICT (proposal_id) WHERE proposal_id IS NOT NULL DO NOTHING
    RETURNING *
  `;
  return (rows[0] as PearlTerminologyRow) || null;
}

export async function updatePearlTerminology(id: number, input: PearlTerminologyInput, actor: string | null = null): Promise<PearlTerminologyRow | null> {
  const db = requireDb();
  const encodedSources = JSON.stringify(input.sourceUrls);
  const rows = await db`
    UPDATE pearl_terminology_overrides SET
      kind = ${input.kind},
      term = ${input.term},
      canonical_slug = ${input.canonicalSlug},
      display_name = ${input.displayName},
      aliases = ${input.aliases}::text[],
      misspellings = ${input.misspellings}::text[],
      related_slugs = ${input.relatedSlugs}::text[],
      categories = ${input.categories}::text[],
      component_slugs = ${input.componentSlugs}::text[],
      ambiguous_with = ${input.ambiguousWith}::text[],
      supersedes_builtin = ${input.supersedesBuiltIn},
      source_urls = ${encodedSources}::jsonb,
      confidence = ${input.confidence},
      review_status = ${input.reviewStatus},
      auto_resolve = ${input.autoResolve},
      enabled = ${input.enabled},
      notes = ${input.notes},
      last_verified = ${input.lastVerified}::date,
      updated_by = ${actor},
      version = version + 1,
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as PearlTerminologyRow) || null;
}

export async function archivePearlTerminology(id: number, actor: string | null = null): Promise<PearlTerminologyRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE pearl_terminology_overrides SET
      archived_at = now(), enabled = FALSE, updated_by = ${actor},
      version = version + 1, updated_at = now()
    WHERE id = ${id} AND archived_at IS NULL
    RETURNING *
  `;
  return (rows[0] as PearlTerminologyRow) || null;
}
