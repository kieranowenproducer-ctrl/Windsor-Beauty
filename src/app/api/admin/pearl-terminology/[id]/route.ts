import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured } from '@/lib/db';
import {
  archivePearlTerminology,
  listPearlTerminology,
  updatePearlTerminology,
} from '@/lib/db/pearlTerminology';
import {
  cleanPearlTerminologyInput,
  pearlInputTerms,
  pearlTermKey,
} from '@/lib/concierge/research/terminology-admin';
import { CURATED_TERMINOLOGY, PEARL_BLEND_MAPPINGS } from '@/lib/concierge/research/chat-engine.mjs';
import { pearlActor, recordPearlChange } from '@/lib/db/pearlAdmin';

export const dynamic = 'force-dynamic';

type BuiltInRecord = Record<string, unknown> & {
  displayName?: string;
  canonicalName?: string;
  aliases?: string[];
  abbreviations?: string[];
  misspellings?: string[];
  phoneticForms?: string[];
};

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

function builtInKeys(): Set<string> {
  const keys = new Set<string>();
  const records = [...CURATED_TERMINOLOGY, ...PEARL_BLEND_MAPPINGS] as BuiltInRecord[];
  for (const record of records) {
    for (const value of [
      record.displayName,
      record.canonicalName,
      ...(record.aliases || []),
      ...(record.abbreviations || []),
      ...(record.misspellings || []),
      ...(record.phoneticForms || []),
    ]) {
      const key = pearlTermKey(value);
      if (key) keys.add(key);
    }
  }
  return keys;
}

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid terminology record.' }, { status: 400 });
  const parsed = cleanPearlTerminologyInput(await request.json().catch(() => null));
  if (!parsed.input) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const wanted = new Set(pearlInputTerms(parsed.input));
    const builtInMatch = Array.from(builtInKeys()).find((key) => wanted.has(key));
    if (builtInMatch) {
      return NextResponse.json({ error: 'That wording already exists in a protected built-in record.' }, { status: 409 });
    }
    const otherRecords = (await withSchema(listPearlTerminology)).filter((row) => row.id !== id);
    const duplicate = otherRecords.find((row) => [row.term, ...(row.aliases || []), ...(row.misspellings || [])]
      .some((value) => wanted.has(pearlTermKey(value))));
    if (duplicate) {
      return NextResponse.json({
        error: `That wording already exists in “${duplicate.term}”.`,
        duplicate: { sourceType: 'admin', id: duplicate.id, matchedTerm: duplicate.term },
      }, { status: 409 });
    }
    const actor = await pearlActor();
    const record = await withSchema(() => updatePearlTerminology(id, parsed.input!, actor));
    if (!record) return NextResponse.json({ error: 'Terminology record not found.' }, { status: 404 });
    await recordPearlChange({
      changeType: 'terminology_updated', entityType: 'terminology', entityId: record.id,
      summary: `Updated “${record.term}”.`, actor,
      detail: { kind: record.kind, reviewStatus: record.review_status, enabled: record.enabled, version: record.version },
    });
    return NextResponse.json({ record });
  } catch (error) {
    console.error('[admin/pearl-terminology] PUT failed:', error);
    return NextResponse.json({ error: 'Could not update the terminology record.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid terminology record.' }, { status: 400 });
  try {
    const actor = await pearlActor();
    const record = await withSchema(() => archivePearlTerminology(id, actor));
    if (!record) return NextResponse.json({ error: 'Terminology record not found.' }, { status: 404 });
    await recordPearlChange({
      changeType: 'terminology_archived', entityType: 'terminology', entityId: record.id,
      summary: `Archived “${record.term}”.`, actor,
      detail: { previousStatus: record.review_status, version: record.version },
    });
    return NextResponse.json({ deleted: true, record });
  } catch (error) {
    console.error('[admin/pearl-terminology] DELETE failed:', error);
    return NextResponse.json({ error: 'Could not delete the terminology record.' }, { status: 500 });
  }
}
