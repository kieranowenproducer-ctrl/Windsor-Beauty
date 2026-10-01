// The invoice builder's Trial choices: the real name, so the admin can see what
// they are picking, beside the permanent code that the customer and Royal Mail
// see. Admin-only (behind the admin sign-in). Cost details stay in the Trial
// admin API. The saved invoice line never carries the name: parseInvoiceInput
// replaces it with the code on save.
import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { listTrialProducts } from '@/lib/db/trialProducts';
import { trialRoyalMailRef } from '@/lib/trialRoyalMailRef';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    const products = (await listTrialProducts()).map((product) => ({
      id: product.id,
      name: product.name,
      code: trialRoyalMailRef(product.id, product.productCode),
      variants: product.variants.map(({ dosage, price, stock }) => ({ dosage, price, stock })),
    }));
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: 'Failed to load Trial invoice choices.' }, { status: 500 });
  }
}
