import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { deletePearlLayoutAssignment, pearlActor, recordPearlChange, setPearlLayoutAssignment } from '@/lib/db/pearlAdmin';
import { COMPOUNDS } from '@/lib/concierge/research/chat-engine.mjs';

export const dynamic = 'force-dynamic';

/**
 * Where a layout applies, and whether it is ON. Assignments are created
 * switched OFF; the toggle here is the one thing that shows a layout to
 * members, and switching it off is the instant revert.
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  let body: { layoutId?: number; targetKind?: string; targetValue?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body.' }, { status: 400 });
  }
  const layoutId = Number(body.layoutId);
  const targetKind = body.targetKind === 'category' ? 'category' : body.targetKind === 'compound' ? 'compound' : null;
  const targetValue = String(body.targetValue || '').trim();
  if (!Number.isInteger(layoutId) || !targetKind || !targetValue) {
    return NextResponse.json({ error: 'Pass the layout, the target kind and the target.' }, { status: 400 });
  }

  const compounds = COMPOUNDS as Array<{ slug: string; name: string; category?: string }>;
  let storedValue = targetValue;
  if (targetKind === 'compound') {
    const compound = compounds.find((item) => item.slug === targetValue || item.name.toLowerCase() === targetValue.toLowerCase());
    if (!compound) return NextResponse.json({ error: 'No approved compound matches that name.' }, { status: 400 });
    storedValue = compound.slug;
  } else {
    const category = compounds.find((item) => String(item.category || '').toLowerCase() === targetValue.toLowerCase());
    if (!category) return NextResponse.json({ error: 'No compound category matches that name.' }, { status: 400 });
    storedValue = String(category.category);
  }

  try {
    const actor = await pearlActor();
    const assignment = await setPearlLayoutAssignment(
      { layoutId, targetKind, targetValue: storedValue, enabled: body.enabled === true },
      actor,
    );
    await recordPearlChange({
      changeType: assignment.enabled ? 'layout_switched_on' : 'layout_switched_off',
      entityType: 'layout',
      entityId: layoutId,
      summary: `${assignment.enabled ? 'Switched ON' : 'Switched off'} a layout for ${targetKind === 'compound' ? 'the compound' : 'the category'} ${storedValue}.`,
      actor,
    });
    return NextResponse.json({ assignment });
  } catch (error) {
    console.error('[admin/pearl/layouts/assign] POST failed:', error);
    return NextResponse.json({ error: 'Could not save the assignment.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Pass the assignment id.' }, { status: 400 });
  try {
    const removed = await deletePearlLayoutAssignment(id);
    if (!removed) return NextResponse.json({ error: 'No assignment has that id.' }, { status: 404 });
    const actor = await pearlActor();
    await recordPearlChange({
      changeType: 'layout_assignment_removed',
      entityType: 'layout',
      entityId: id,
      summary: 'Removed a layout assignment. The answers there return to their normal arrangement.',
      actor,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/pearl/layouts/assign] DELETE failed:', error);
    return NextResponse.json({ error: 'Could not remove the assignment.' }, { status: 500 });
  }
}
