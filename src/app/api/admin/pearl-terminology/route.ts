import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import {
  createPearlTerminology,
  listPearlTerminology,
  type PearlTerminologyRow,
} from '@/lib/db/pearlTerminology';
import {
  cleanPearlTerminologyInput,
  pearlInputTerms,
  pearlTermKey,
} from '@/lib/concierge/research/terminology-admin';
import {
  COMPOUNDS,
  CURATED_TERMINOLOGY,
  PEARL_BLEND_MAPPINGS,
  terminologyManagementSummary,
} from '@/lib/concierge/research/chat-engine.mjs';
import { pearlActor, recordPearlChange } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

async function withSchema<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== '42P01' && code !== '42703') throw error;
    await ensureSchema();
    return work();
  }
}

type BuiltInRecord = Record<string, unknown> & {
  id: string;
  recordType?: string;
  displayName?: string;
  canonicalName?: string;
  aliases?: string[];
  abbreviations?: string[];
  misspellings?: string[];
  phoneticForms?: string[];
};

const BUILT_IN_RECORDS = [...CURATED_TERMINOLOGY, ...PEARL_BLEND_MAPPINGS] as BuiltInRecord[];

function publicBuiltIn(record: BuiltInRecord) {
  const canonicalSlug = typeof record.canonicalSlug === 'string' ? record.canonicalSlug : '';
  const profileSlug = typeof record.profileSlug === 'string' ? record.profileSlug : '';
  const compound = COMPOUNDS.find((item) => item.slug === (canonicalSlug || profileSlug));
  return {
    ...record,
    sourceType: 'built-in',
    categories: compound?.category ? [compound.category] : [],
  };
}

function builtInTerms(record: BuiltInRecord): Array<{ key: string; label: string }> {
  const values = [
    record.displayName,
    record.canonicalName,
    ...(record.aliases || []),
    ...(record.abbreviations || []),
    ...(record.misspellings || []),
    ...(record.phoneticForms || []),
  ];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((label) => ({ key: pearlTermKey(label), label }))
    .filter((item) => item.key);
}

function adminTerms(record: PearlTerminologyRow): Array<{ key: string; label: string }> {
  return [record.term, ...(record.aliases || []), ...(record.misspellings || [])]
    .map((label) => ({ key: pearlTermKey(label), label }))
    .filter((item) => item.key);
}

/* `supersedes` names the built-in an edit is replacing (Kieran, 19 Aug 2026).
   Without it, editing a built-in was impossible: the edit necessarily carries
   the same wording as the record it stands in for, so the duplicate check
   rejected every single one with "that wording already exists". A built-in
   being replaced is not a clash with itself. */
function findDuplicate(keys: string[], records: PearlTerminologyRow[], supersedes?: string | null) {
  const wanted = new Set(keys);
  for (const record of BUILT_IN_RECORDS) {
    if (supersedes && record.id === supersedes) continue;
    const match = builtInTerms(record).find((item) => wanted.has(item.key));
    if (match) return { sourceType: 'built-in', id: record.id, matchedTerm: match.label };
  }
  for (const record of records) {
    // An existing edit of the SAME built-in is the row we are about to update,
    // not a clash either.
    if (supersedes && record.supersedes_builtin === supersedes) continue;
    const match = adminTerms(record).find((item) => wanted.has(item.key));
    if (match) return { sourceType: 'admin', id: record.id, matchedTerm: match.label };
  }
  return null;
}

export async function GET() {
  const builtIn = terminologyManagementSummary();
  const compounds = COMPOUNDS.map((compound) => ({ slug: compound.slug, name: compound.name }));
  const builtInRecords = BUILT_IN_RECORDS.map(publicBuiltIn);
  if (!isDbConfigured()) return NextResponse.json({ records: [], builtIn, builtInRecords, compounds });
  try {
    return NextResponse.json({
      records: await withSchema(listPearlTerminology),
      builtIn,
      builtInRecords,
      compounds,
    });
  } catch (error) {
    console.error('[admin/pearl-terminology] GET failed:', error);
    return NextResponse.json({ error: 'Could not load PEARL terminology.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const parsed = cleanPearlTerminologyInput(await request.json().catch(() => null));
  if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const records = await withSchema(listPearlTerminology);
    const duplicate = findDuplicate(pearlInputTerms(parsed.input), records, parsed.input.supersedesBuiltIn);
    if (duplicate) {
      return NextResponse.json({
        error: `That wording already exists as “${duplicate.matchedTerm}”.`,
        duplicate,
      }, { status: 409 });
    }
    const actor = await pearlActor();
    const record = await withSchema(() => createPearlTerminology(parsed.input!, actor));
    if (!record) throw new Error('The insert returned no row.'); // only possible for stamped proposal inserts, which this route never makes
    await recordPearlChange({
      changeType: 'terminology_created',
      entityType: 'terminology',
      entityId: record.id,
      summary: `Added “${record.term}” for review.`,
      actor,
      detail: { kind: record.kind, canonicalSlug: record.canonical_slug, reviewStatus: record.review_status },
    });
    return NextResponse.json({ record });
  } catch (error) {
    console.error('[admin/pearl-terminology] POST failed:', error);
    return NextResponse.json({ error: 'Could not save the terminology record.' }, { status: 500 });
  }
}
