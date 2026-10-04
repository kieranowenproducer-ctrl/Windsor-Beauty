import { beautyOperationalAddress } from '@/lib/operationalAddress';
import {
  listPendingStockAlerts,
  logAutomationFailure,
  markStockAlertsNotified,
} from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { getProductsBySlug } from '@/lib/shipping';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';

const FROM_ADDRESS = 'Windsor Beauty <orders@windsorbeauty.is>';

interface BackInStockEmailParams {
  to: string;
  productName: string;
  productUrl: string;
}

async function sendBackInStockEmail(params: BackInStockEmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY_BEAUTY_IS?.trim()) return false;

  try {
    const { error } = await sendEmail(buildBackInStockEmail(params));

    if (error) {
      console.error('Resend error (back in stock):', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send threw (back in stock):', err);
    return false;
  }
}

// Called the moment an admin restocks a product from zero to a positive
// quantity (see POST /api/admin/products/stock). Sends every customer
// waiting on this slug their alert, then marks only the ones that actually
// sent as notified , a transient Resend failure leaves a row pending so the
// next restock (or a retry) picks it up again instead of silently dropping it.
export async function notifyBackInStock(productSlug: string): Promise<void> {
  const pending = await listPendingStockAlerts(productSlug);
  if (pending.length === 0) return;

  const productsBySlug = await getProductsBySlug();
  const product = productsBySlug.get(productSlug);
  if (!product) return;

  const siteUrl = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.windsorbeauty.is';
  const productUrl = `${siteUrl}/shop/${productSlug}`;

  const sentIds: number[] = [];
  for (const alert of pending) {
    const sent = await sendBackInStockEmail({
      to: alert.email,
      productName: product.name,
      productUrl,
    }).catch(() => false);
    if (sent) {
      sentIds.push(alert.id);
    } else {
      // Self-healing (the row stays pending for the next restock to retry),
      // but still worth surfacing on System Health so a run of failures for
      // one product doesn't go unnoticed indefinitely.
      await logAutomationFailure('customer_email', 'Back-in-stock alert email failed to send', { detail: { email: alert.email, productSlug } });
    }
  }

  await markStockAlertsNotified(sentIds).catch(err =>
    logAutomationFailure('back_in_stock', 'Could not mark stock alerts as notified', { detail: err })
  );
}

export function buildBackInStockEmail(params: BackInStockEmailParams) {


  return {
      from: FROM_ADDRESS,
      // Replies reach a person. A customer answering an order or payment email was
      // writing into a void, and a From address that refuses replies is a pattern spam
      // filters associate with phishing (invoice junk-folder diagnosis, 31 July 2026).
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject: `${params.productName} is back in stock`,
      text:
        `Good news. ${params.productName} is back in stock at Windsor Beauty.\n\n` +
        `Order now: ${params.productUrl}\n\n` +
        `Thanks,\nWindsor Beauty`,
      html: emailDocument({
        title: `${params.productName} is back in stock`,
        headerLabel: 'Back In Stock',
        bodyHtml: `
        <!-- Body -->
        <tr>
          <td style="padding:40px;font-size:14px;color:#44403c;line-height:1.6">
            <p style="margin:0 0 16px;">Good news. <strong>${escapeHtml(params.productName)}</strong> is back in stock at Windsor Beauty.</p>
            <p style="margin:0 0 16px;">
              <a href="${escapeHtml(params.productUrl)}" style="color:#A9695D;">Order now &rarr;</a>
            </p>
            <p style="margin:0;">Thanks,<br />Windsor Beauty</p>
          </td>
        </tr>`,
      }),
    };
}
