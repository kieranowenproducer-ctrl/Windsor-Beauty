import { NextResponse } from 'next/server';
import { affiliatesEnabled, listAffiliateCodesNeedingReminder, markAffiliateCodeReminderSent } from '@/lib/affiliates';
import { sendAffiliateCodeExpiryEmail } from '@/lib/affiliateEmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!affiliatesEnabled()) return NextResponse.json({ checked: 0, sent: 0, paused: true });
  const rows = await listAffiliateCodesNeedingReminder();
  let sent = 0;
  for (const row of rows) {
    const result = await sendAffiliateCodeExpiryEmail({ email: String(row.email), firstName: String(row.first_name || ''), code: String(row.code), expiresAt: String(row.expires_at) });
    if (result.ok) { await markAffiliateCodeReminderSent(Number(row.id)); sent += 1; }
  }
  return NextResponse.json({ checked: rows.length, sent });
}
