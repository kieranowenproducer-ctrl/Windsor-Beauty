import { NextResponse } from 'next/server';
import { deleteMarketingDraft, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

// DELETE /api/admin/marketing/drafts/[id]
//
// Drafts only — the database delete is scoped to status = 'draft', so a sent
// campaign (the audit record of a real send) can never be removed this way.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid draft id.' }, { status: 400 });
  }

  const deleted = await deleteMarketingDraft(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Draft not found (sent campaigns cannot be deleted).' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
