import { NextResponse } from 'next/server';
import { findMarketingCampaignById, isDbConfigured } from '@/lib/db';
import { renderMarketingEmailHtml } from '@/lib/marketingEmail';
import { resolveMarketingSender } from '@/lib/email/marketingSender';

export const dynamic = 'force-dynamic';

// GET /api/admin/marketing/campaigns/[id]/preview
//
// Renders a stored campaign exactly as it went out (task 842923ab): the
// paragraph HTML saved at send time, wrapped in the real email frame, with
// the same From-address footer it carried. For sent campaigns this is the
// faithful record, not a reconstruction.
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid campaign id.' }, { status: 400 });
  }

  const campaign = await findMarketingCampaignById(id);
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
  }

  const sender = resolveMarketingSender(campaign.sender ?? undefined);
  const html = renderMarketingEmailHtml({
    subject: campaign.subject,
    bodyHtml: campaign.body_html,
    unsubscribeUrl: 'https://windsorglow.com/unsubscribe?token=preview',
    sender: sender.key,
    // The button this campaign actually carried. Null on anything older than
    // the choice, which renders the "Shop Now" button it really went out with.
    ctaLabel: campaign.cta_label,
    ctaUrl: campaign.cta_url,
    headerLabel: campaign.header_label,
  });

  return NextResponse.json({ html, subject: campaign.subject, status: campaign.status });
}
