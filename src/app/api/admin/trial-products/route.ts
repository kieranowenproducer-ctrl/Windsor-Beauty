// Trial products (task 96b2ffe7). Admin-only CRUD for the separate trial
// inventory. Protected by the /api/admin middleware guard, same as every other
// admin endpoint. Nothing here is ever exposed to the public shop.
import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { listTrialProducts, upsertTrialProduct, deleteTrialProduct } from '@/lib/db/trialProducts';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    return NextResponse.json({ products: await listTrialProducts() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load trial products.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'A product name is required.' }, { status: 400 });
  const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'Uncategorised';
  const id = Number.isInteger(body.id) && body.id > 0 ? body.id : undefined;
  const variants = Array.isArray(body.variants) ? body.variants : [];
  try {
    const product = await upsertTrialProduct({ id, name, category, variants });
    return NextResponse.json({ product });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save trial product.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  try {
    await deleteTrialProduct(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete trial product.' }, { status: 500 });
  }
}
