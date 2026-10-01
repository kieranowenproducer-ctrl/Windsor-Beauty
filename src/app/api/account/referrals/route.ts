import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { addGlowCardDemoStamp, claimGlowCardDemoReward, getGlowCardDemo, glowCardDemoDesign, redeemGlowCardDemoReward, resetGlowCardDemo } from '@/lib/glowCardDemo';
import {
  claimReferralReward, getOrCreateReferralCode, isGlowCardFrozen, memberReferralCard, referralsEnabled,
} from '@/lib/memberReferrals';
import { claimGlowCardReward, getGlowCardSummary, glowCardLoyaltyEnabled } from '@/lib/glowCardLoyalty';

export async function GET(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Please sign in to see your Glow Card.' }, { status: 401 });
  const demoDesign = glowCardDemoDesign(customer.email);
  if (demoDesign) {
    try { return NextResponse.json(await getGlowCardDemo(customer.id, demoDesign)); }
    catch { return NextResponse.json({ error: 'Your demo card is temporarily unavailable.' }, { status: 503 }); }
  }
  if (glowCardLoyaltyEnabled()) {
    if (customer.banned_at || await isGlowCardFrozen(customer.id)) return NextResponse.json({ error: 'Member rewards are not available for this account.' }, { status: 403 });
    if (!customer.email_verified) return NextResponse.json({ error: 'Please verify your email before using your Glow Card.' }, { status: 403 });
    try {
      const [card, code] = await Promise.all([getGlowCardSummary(customer.id), getOrCreateReferralCode(customer.id)]);
      return NextResponse.json({ loyalty: true, code, ...card, loyaltyRewards: card.rewards });
    } catch { return NextResponse.json({ error: 'Your Glow Card is temporarily unavailable. Please try again shortly.' }, { status: 503 }); }
  }
  if (!referralsEnabled()) return NextResponse.json({ error: 'Member referrals are not available yet.' }, { status: 404 });
  if (customer.banned_at) return NextResponse.json({ error: 'Member rewards are not available for this account.' }, { status: 403 });
  if (await isGlowCardFrozen(customer.id)) return NextResponse.json({ error: 'Your Glow Card is temporarily paused. Please contact Windsor Beauty if you think this is a mistake.' }, { status: 403 });
  if (!customer.email_verified) return NextResponse.json({ error: 'Please verify your email before sharing your referral link.' }, { status: 403 });
  try {
    return NextResponse.json(await memberReferralCard(customer.id));
  } catch {
    return NextResponse.json({ error: 'Your Glow Card is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) return NextResponse.json({ error: 'Please sign in to claim a reward.' }, { status: 401 });
  const demoDesign = glowCardDemoDesign(customer.email);
  if (demoDesign) {
    const body = await request.json().catch(() => null);
    try {
      const action = String(body?.action ?? 'claim');
      let success = false;
      if (action === 'add-stamp') success = await addGlowCardDemoStamp(customer.id, demoDesign);
      else if (action === 'claim') success = await claimGlowCardDemoReward(customer.id, demoDesign, Number(body?.stamps));
      else if (action === 'redeem') success = await redeemGlowCardDemoReward(customer.id, demoDesign, String(body?.code ?? ''));
      else if (action === 'reset') { await resetGlowCardDemo(customer.id, demoDesign); success = true; }
      return NextResponse.json({ success }, { status: success ? 200 : 409 });
    } catch {
      return NextResponse.json({ error: 'The demo card could not be updated. Please try again.' }, { status: 503 });
    }
  }
  if (glowCardLoyaltyEnabled()) {
    if (customer.banned_at || await isGlowCardFrozen(customer.id)) return NextResponse.json({ error: 'Member rewards are not available for this account.' }, { status: 403 });
    const body = await request.json().catch(() => null);
    const milestone = Number(body?.milestone);
    const cycle = body?.cycle === undefined ? undefined : Number(body.cycle);
    if (![5, 10, 15].includes(milestone)) return NextResponse.json({ error: 'Please choose a listed reward.' }, { status: 400 });
    if (cycle !== undefined && (!Number.isInteger(cycle) || cycle < 1)) return NextResponse.json({ error: 'That reward card is not valid.' }, { status: 400 });
    try {
      const reward = await claimGlowCardReward(customer.id, milestone as 5 | 10 | 15, cycle);
      if (!reward) return NextResponse.json({ error: 'That reward is not ready, or has already been claimed.' }, { status: 409 });
      return NextResponse.json({ success: true, reward });
    } catch { return NextResponse.json({ error: 'We could not claim that reward. Please try again.' }, { status: 503 }); }
  }
  if (!referralsEnabled()) return NextResponse.json({ error: 'Member referrals are not available yet.' }, { status: 404 });
  if (customer.banned_at) return NextResponse.json({ error: 'Member rewards are not available for this account.' }, { status: 403 });
  if (await isGlowCardFrozen(customer.id)) return NextResponse.json({ error: 'Your Glow Card is temporarily paused. Please contact Windsor Beauty if you think this is a mistake.' }, { status: 403 });
  if (!customer.email_verified) return NextResponse.json({ error: 'Please verify your email before claiming a reward.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const stamps = Number(body?.stamps);
  if (![5, 10, 15].includes(stamps)) return NextResponse.json({ error: 'Please choose a listed reward.' }, { status: 400 });
  try {
    const code = await claimReferralReward(customer.id, stamps);
    if (!code) return NextResponse.json({ error: 'That stage is not ready to claim, or it has already been claimed.' }, { status: 409 });
    return NextResponse.json({ success: true, code });
  } catch (error) {
    if (error instanceof Error && error.message === 'REFERRAL_STAGE_REVIEW') {
      return NextResponse.json({ error: 'This stage is waiting for staff review. No code has been created.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'We could not claim that reward. Please refresh your card and try again.' }, { status: 409 });
  }
}
