import { NextResponse } from 'next/server';
import { addBatch, isDbConfigured, listBatches, setBatchActive, updateBatch } from '@/lib/db';

// GET  /api/admin/batches            → { batches }
// POST /api/admin/batches            → add a batch code   { code, productName?, note? }
// PATCH /api/admin/batches           → edit fields { id, code, productName?, note? }
//                                      OR activate/deactivate { id, active }
//
// Gated by the admin middleware like every other /api/admin route.

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  try {
    const batches = await listBatches(true);
    return NextResponse.json({ batches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load batches.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'Provide a batch code.' }, { status: 400 });
  }
  try {
    const batch = await addBatch(code, body?.productName ?? null, body?.note ?? null);
    return NextResponse.json({ ok: true, batch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add batch.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Provide a batch id.' }, { status: 400 });
  }

  // Edit path: a `code` string means the admin is saving field changes.
  if (typeof body?.code === 'string') {
    const code = body.code.trim();
    if (!code) {
      return NextResponse.json({ error: 'Provide a batch code.' }, { status: 400 });
    }
    try {
      const batch = await updateBatch(id, code, body?.productName ?? null, body?.note ?? null);
      if (!batch) {
        return NextResponse.json({ error: 'That batch no longer exists.' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, batch });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update batch.';
      // Unique(code) collision — surface a clear, non-technical message.
      const friendly = /duplicate key|unique/i.test(message)
        ? `Another batch already uses the code "${code}". Choose a different code.`
        : message;
      return NextResponse.json({ error: friendly }, { status: /duplicate key|unique/i.test(message) ? 409 : 500 });
    }
  }

  // Toggle path: activate / deactivate.
  if (typeof body?.active !== 'boolean') {
    return NextResponse.json({ error: 'Provide a batch code to edit, or an active flag.' }, { status: 400 });
  }
  try {
    await setBatchActive(id, body.active);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update batch.' },
      { status: 500 }
    );
  }
}
