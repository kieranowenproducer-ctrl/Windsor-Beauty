import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { listProductBuyers, type GroupKind } from '@/lib/productSales';

export const dynamic = 'force-dynamic';

// Who bought one product (task aa684446) — the list behind "Email these customers".
//
// It returns everybody who bought it, including people who have unsubscribed. That is deliberate:
// this list is also how you see your regulars. Consent is enforced where the email actually goes
// out (/api/admin/marketing/send drops anyone unsubscribed, whoever put their address in), so
// nothing here can cause an unwanted email.
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ dbConfigured: false, buyers: [] });
  }

  const url = new URL(request.url);
  const product = (url.searchParams.get('product') ?? '').trim();
  if (!product) {
    return NextResponse.json({ error: 'Which product?' }, { status: 400 });
  }

  const kind: GroupKind = url.searchParams.get('groupBy') === 'campaign' ? 'campaign' : 'referral';
  const groups = (url.searchParams.get('groups') ?? '').split('|').map((g) => g.trim()).filter(Boolean);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;

  try {
    const buyers = await listProductBuyers(product, { kind, groups, from, to });
    return NextResponse.json({ dbConfigured: true, buyers });
  } catch {
    return NextResponse.json({ error: 'Could not load who bought this.' }, { status: 500 });
  }
}
