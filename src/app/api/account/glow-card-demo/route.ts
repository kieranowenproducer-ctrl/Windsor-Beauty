import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { addGlowCardDemoStamp, claimGlowCardDemoReward, getGlowCardDemo, glowCardDemoDesign, redeemGlowCardDemoReward, resetGlowCardDemo } from '@/lib/glowCardDemo';

export async function GET(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const design = glowCardDemoDesign(customer.email);
  if (!design) return NextResponse.json({ error: 'This demo is not available for your account.' }, { status: 404 });
  if (customer.banned_at) return NextResponse.json({ error: 'This account is closed.' }, { status: 403 });
  try { return NextResponse.json(await getGlowCardDemo(customer.id, design), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'Your demo card is temporarily unavailable.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  const design = glowCardDemoDesign(customer.email);
  if (!design) return NextResponse.json({ error: 'This demo is not available for your account.' }, { status: 404 });
  if (customer.banned_at) return NextResponse.json({ error: 'This account is closed.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  try {
    const action = String(body?.action ?? 'claim');
    let success = false;
    if (action === 'add-stamp') success = await addGlowCardDemoStamp(customer.id, design);
    else if (action === 'claim') success = await claimGlowCardDemoReward(customer.id, design, Number(body?.stamps));
    else if (action === 'redeem') success = await redeemGlowCardDemoReward(customer.id, design, String(body?.code ?? ''));
    else if (action === 'reset') { await resetGlowCardDemo(customer.id, design); success = true; }
    return NextResponse.json({ success }, { status: success ? 200 : 409 });
  } catch { return NextResponse.json({ error: 'The demo could not be updated. Please try again.' }, { status: 503 }); }
}
