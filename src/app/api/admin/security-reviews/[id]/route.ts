import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { NextResponse } from 'next/server';
import { decideSecurityReviewCase, type SecurityReviewStatus } from '@/lib/db/securityReviews';

const STATUSES = new Set<SecurityReviewStatus>(['pending', 'legitimate_shared_network', 'confirmed_duplicate', 'dismissed']);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Administrator sign-in required.'},{status:401});
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Refresh this page before saving.'},{status:403});
  const { id } = await context.params;
  const caseId = Number(id);
  const body = await request.json().catch(() => null);
  const status = body?.status as SecurityReviewStatus;
  const expectedStatus = body?.expectedStatus as SecurityReviewStatus;
  const expectedUpdatedAt = body?.expectedUpdatedAt;
  if (typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) return NextResponse.json({error:'Refresh this review before deciding.'},{status:400});
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!Number.isInteger(caseId) || caseId < 1 || !STATUSES.has(status) || !STATUSES.has(expectedStatus)) {
    return NextResponse.json({ error: 'Choose a valid review decision.' }, { status: 400 });
  }
  if (note.length > 2000 || (status !== 'pending' && !note)) {
    return NextResponse.json({ error: 'Add a short note explaining the decision.' }, { status: 400 });
  }
  try {
    const row = await decideSecurityReviewCase({ caseId, status, note, expectedStatus, expectedUpdatedAt });
    if (!row) return NextResponse.json({ error: 'This review changed or no longer exists. Refresh before deciding again.' }, { status: 409 });
    return NextResponse.json({ case: row });
  } catch (error) {
    return NextResponse.json({ error: 'Could not save that decision.' }, { status: 500 });
  }
}
