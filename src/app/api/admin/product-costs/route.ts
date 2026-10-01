// Cost basis for the Profitability page (task 66a6a137).
// GET  -> all saved product costs. POST -> upsert one { productSlug, dosage, unitCost, supplier?, note? }.
// Protected by the /api/admin middleware guard, same as every other admin endpoint.
import { NextResponse } from 'next/server';
import { isDbConfigured, listProductCosts, upsertProductCost } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    return NextResponse.json({ costs: await listProductCosts() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load costs.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  const productSlug = typeof body.productSlug === 'string' ? body.productSlug.trim() : '';
  if (!productSlug) return NextResponse.json({ error: 'productSlug is required.' }, { status: 400 });
  const dosage = typeof body.dosage === 'string' ? body.dosage.trim() : '';
  const unitCost = Number(body.unitCost);
  if (!Number.isFinite(unitCost) || unitCost < 0) return NextResponse.json({ error: 'unitCost must be a non-negative number.' }, { status: 400 });
  const components = Array.isArray(body.components)
    ? body.components.map((c: unknown) => ({ label: String((c as { label?: unknown })?.label ?? ''), amount: Number((c as { amount?: unknown })?.amount) || 0 }))
    : undefined;
  const shippingPerUnit = body.shippingPerUnit === undefined ? undefined : Number(body.shippingPerUnit);
  try {
    const row = await upsertProductCost({ productSlug, dosage, unitCost, components, supplier: body.supplier, note: body.note, shippingPerUnit });
    return NextResponse.json({ cost: row });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save cost.' }, { status: 500 });
  }
}
