import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { affiliatesEnabled, getOrCreateAffiliateRequestKey } from '@/lib/affiliates';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('preview') === '1') {
    return NextResponse.json({ link: `${new URL(request.url).origin}/raf-invite/${'a'.repeat(32)}`, preview: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!affiliatesEnabled()) return NextResponse.json({ error: 'Affiliate invitations are not open yet.' }, { status: 404 });
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Sign in to get your request page.' }, { status: 401 });
  try {
    const key = await getOrCreateAffiliateRequestKey(customer.id);
    const requestUrl = new URL(request.url);
    const localPreview = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(requestUrl.hostname);
    return NextResponse.json({ link: `${localPreview ? requestUrl.origin : 'https://www.windsorbeauty.co.uk'}/raf-invite/${key}` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Your request page is not available yet.' }, { status: 404 });
  }
}
