import { NextResponse } from 'next/server';
import { deleteAutomationFailure, isDbConfigured, setAutomationFailureResolved } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/system-health/failures/:id  { resolved: boolean }
//
// Ticks one entry off the list, or puts it back. Everything under /api/admin is
// already behind the admin session cookie in src/proxy.ts, so there is no
// separate check here — the same as every other admin endpoint.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.resolved !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const updated = await setAutomationFailureResolved(id, body.resolved).catch(() => false);
  if (!updated) {
    return NextResponse.json(
      { error: 'Could not update that entry. If this is a new feature, run the database setup on this page first.' },
      { status: 404 }
    );
  }
  return NextResponse.json({ success: true, resolved: body.resolved });
}

// DELETE /api/admin/system-health/failures/:id
//
// Removes one entry for good (task f95367d6). The dashboard's Latest Activity
// feed uses this for the red "Problem" rows: an entry that no longer applies is
// cleared rather than left sitting on the first screen anybody sees.
//
// Same admin protection as the PATCH above, for the same reason: everything
// under /api/admin is already behind the admin session cookie in src/proxy.ts.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  // A database that refused the delete and a row that was already gone are two
  // different things, and must never share a message: "it is not there any
  // more" told about a failed delete is the screen lying to the operator.
  let removed: boolean;
  try {
    removed = await deleteAutomationFailure(id);
  } catch (err) {
    console.error('[system-health/failures] delete failed', err);
    return NextResponse.json({ error: 'Could not remove that entry. It is still on the list. Please try again.' }, { status: 500 });
  }

  if (!removed) {
    return NextResponse.json({ error: 'That entry is not there any more. Reload the page to see the current list.' }, { status: 404 });
  }
  return NextResponse.json({ success: true, deleted: id });
}
