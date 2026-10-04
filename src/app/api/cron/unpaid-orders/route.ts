import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { NextResponse } from 'next/server';
import {
  claimDuePaymentReminders,
  expireUnpaidCheckoutReservations,
  isDbConfigured,
  releasePaymentReminderClaim,
} from '@/lib/db';
import { recordCronRun } from '@/lib/cronHeartbeat';
import { afterStockMovement } from '@/lib/retireProducts';
import { sendPaymentResumeEmail } from '@/lib/paymentResumeEmail';
import { reportAutomationFailure } from '@/lib/automationFailure';
import { referralsEnabled, releaseReferralVoucherForUnpaidOrder } from '@/lib/memberReferrals';
import { releaseGlowCardVoucherForUnpaidOrder } from '@/lib/glowCardLoyalty';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database is not configured.' }, { status: 503 });
  try {
    const reminders = await claimDuePaymentReminders();
    let reminderSentCount = 0;
    let reminderFailedCount = 0;
    const siteUrl = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.windsorbeauty.is';
    for (const order of reminders) {
      const resumeUrl = `${siteUrl}/resume-payment/${order.payment_access_token}`;
      if (order.payment_method === 'paypal') continue;
      const sent = await sendPaymentResumeEmail({
            to: order.email, customerName: order.customer_name, orderNumber: order.order_number,
            total: Number(order.total), resumeUrl,
          });
      if (sent) {
        reminderSentCount += 1;
      } else {
        reminderFailedCount += 1;
        await releasePaymentReminderClaim(order.order_number);
        await reportAutomationFailure(
          'customer_email',
          `The automatic payment reminder for ${order.order_number} was not sent. It will retry on the next run.`,
          { orderNumber: order.order_number, alertAdmin: true },
        );
      }
    }
    const expired = await expireUnpaidCheckoutReservations();
    if (referralsEnabled()) {
      for (const orderNumber of expired) {
        await releaseReferralVoucherForUnpaidOrder(orderNumber).catch(() => false);
      }
    }
    for (const orderNumber of expired) {
      await releaseGlowCardVoucherForUnpaidOrder(orderNumber).catch(() => false);
    }
    if (expired.length) await afterStockMovement();
    await recordCronRun(
      'unpaid-orders',
      `sent ${reminderSentCount} reminder(s), failed ${reminderFailedCount}, expired ${expired.length} reservation(s)`,
    );
    return NextResponse.json({
      ok: true,
      reminderSentCount,
      reminderFailedCount,
      expiredCount: expired.length,
      orderNumbers: expired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordCronRun('unpaid-orders', 'failed', message);
    return NextResponse.json({ error: 'Unpaid order expiry failed.' }, { status: 500 });
  }
}
