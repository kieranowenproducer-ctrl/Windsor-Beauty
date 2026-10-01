import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/replyCapture';
import { updateCustomerEmailDelivery } from '@/lib/db/customerEmails';
import { markInvitationEmailFailedByProvider } from '@/lib/affiliates';

export const dynamic = 'force-dynamic';

const TRACKED = new Set([
  'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
  'email.failed', 'email.complained', 'email.suppressed', 'email.opened', 'email.clicked',
]);

export async function POST(request: Request) {
  const payload = await request.text();
  const secrets = [
    process.env.RESEND_OUTBOUND_WEBHOOK_SECRET,
    process.env.RESEND_OUTBOUND_WEBHOOK_SECRET_PAYPAL,
  ].filter((value): value is string => Boolean(value));
  if (!secrets.length) {
    return NextResponse.json({ error: 'Outbound email tracking is not configured.' }, { status: 503 });
  }

  const signature = {
    id: request.headers.get('svix-id') ?? '',
    timestamp: request.headers.get('svix-timestamp') ?? '',
    signatureHeader: request.headers.get('svix-signature') ?? '',
    payload,
  };
  if (!secrets.some(secret => verifyWebhookSignature({ secret, ...signature }))) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: { type?: string; created_at?: string; data?: { email_id?: string } };
  try { event = JSON.parse(payload); }
  catch { return NextResponse.json({ error: 'Not JSON.' }, { status: 400 }); }

  if (!event.type || !TRACKED.has(event.type) || !event.data?.email_id) {
    return NextResponse.json({ ignored: true });
  }
  const status = event.type.replace('email.', '');
  const matched = await updateCustomerEmailDelivery(event.data.email_id, status, event.created_at ?? null).catch(() => false);
  // A Raf invitation that bounces shows as "email did not arrive" on his dashboard, so he knows to
  // send the link from his phone instead.
  if (['bounced', 'failed', 'complained', 'suppressed'].includes(status)) {
    await markInvitationEmailFailedByProvider(event.data.email_id).catch(() => false);
  }
  return NextResponse.json({ ok: true, matched });
}
