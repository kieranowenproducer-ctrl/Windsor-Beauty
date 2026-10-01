import { NextResponse } from 'next/server';
import { decideSecurityReviewCase, type SecurityReviewStatus } from '@/lib/db/securityReviews';

const STATUSES = new Set<SecurityReviewStatus>(['pending', 'legitimate_shared_network', 'confirmed_duplicate', 'dismissed']);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caseId = Number(id);
  const body = await request.json().catch(() => null);
  const status = body?.status as SecurityReviewStatus;
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!Number.isInteger(caseId) || caseId < 1 || !STATUSES.has(status)) {
    return NextResponse.json({ error: 'Choose a valid review decision.' }, { status: 400 });
  }
  if (status !== 'pending' && !note) {
    return NextResponse.json({ error: 'Add a short note explaining the decision.' }, { status: 400 });
  }
  try {
    const row = await decideSecurityReviewCase({ caseId, status, note });
    if (!row) return NextResponse.json({ error: 'Review case not found.' }, { status: 404 });
    return NextResponse.json({ case: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save that decision.' }, { status: 500 });
  }
}
