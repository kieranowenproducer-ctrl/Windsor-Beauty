import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { glowCardDemoDesign } from '@/lib/glowCardDemo';
import GlowCardClient from './GlowCardClient';

export default async function GlowCardDemoPage() {
  const request = new Request('https://www.windsorbeauty.is/account/glow-card', { headers: await headers() });
  const customer = await resolveCustomerFromRequest(request);
  const demoDesign = customer ? glowCardDemoDesign(customer.email) : null;
  const liveMemberCard = (process.env.WB_MEMBER_REFERRALS_ENABLED === 'true' || process.env.WB_GLOW_CARD_LOYALTY_ENABLED === 'true') && customer?.email_verified;
  if (!customer || customer.banned_at || (!demoDesign && !liveMemberCard)) notFound();
  return <GlowCardClient />;
}
