import { NextResponse } from 'next/server';
import { isDbConfigured, listMarketingCampaigns } from '@/lib/db';
import { marketingBodyToText } from '@/lib/marketingEmail';

export const dynamic = 'force-dynamic';

// Every previous campaign — sent or draft — with the editable text included,
// so any of them can be previewed, edited and reused from the history table
// (task 842923ab). Older campaigns never stored their raw text; for those it
// is reconstructed from the stored HTML.
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ campaigns: [], dbConfigured: false });
  }

  const campaigns = await listMarketingCampaigns();
  return NextResponse.json({
    dbConfigured: true,
    campaigns: campaigns.map(c => ({
      id: c.id,
      subject: c.subject,
      status: c.status === 'draft' ? 'draft' : 'sent',
      bodyText: c.body_text ?? marketingBodyToText(c.body_html),
      sender: c.sender,
      // Null on anything written before the button was choosable, which the
      // composer reads as "the template defaults".
      ctaLabel: c.cta_label,
      ctaUrl: c.cta_url,
      headerLabel: c.header_label,
      recipientCount: c.recipient_count,
      successCount: c.success_count,
      failureCount: c.failure_count,
      sentAt: c.sent_at,
    })),
  });
}
