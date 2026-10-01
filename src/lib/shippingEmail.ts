import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { UK_DELIVERY } from './shippingWindows';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

const FROM_ADDRESS = 'Windsor Beauty <orders@windsorbeauty.co.uk>';

export function isShippingEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

interface ShippingNotificationParams {
  to: string;
  customerName: string;
  orderNumber: string;
  trackingNumber: string;
  carrierName: string;
}

function trackingUrl(trackingNumber: string) {
  return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}`;
}

/**
 * Builds the dispatch email without sending it.
 *
 * Split out of the sender (task 8a498491) so the admin can LOOK at the real
 * email rather than a mock-up of it — Kieran asked to see what a customer
 * actually receives. Same shape as `buildOrderConfirmationEmail`, which has
 * always worked this way. The sender below is the only other caller, so what
 * is previewed is byte-for-byte what is sent.
 */
export function buildShippingConfirmationEmail(
  params: ShippingNotificationParams,
): { subject: string; text: string; html: string } {
  const url = trackingUrl(params.trackingNumber);
  const firstName = escapeHtml(params.customerName.split(' ')[0]);

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#b8902a">On Its Way</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">Your order is on its way, ${firstName}.</h1>
            <p style="margin:0 0 24px;font-size:13px;color:#57534e;line-height:1.6">
              Your Windsor Beauty order has been dispatched with ${escapeHtml(params.carrierName)} and is on its way to you.
            </p>

            <!-- Order number badge -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
              <tr>
                <td style="border:1px solid #e7dcc8;background:#fefce8;padding:10px 20px">
                  <p style="margin:0;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;margin-bottom:2px">Order Reference</p>
                  <p style="margin:0;font-size:14px;font-family:monospace;font-weight:bold;color:#b8902a;letter-spacing:0.1em">${escapeHtml(params.orderNumber)}</p>
                </td>
              </tr>
            </table>

            <!-- Tracking box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #e7dcc8;margin-bottom:32px">
              <tr>
                <td style="padding:20px 24px">
                  <p style="margin:0 0 12px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e">Tracking Information</p>
                  <p style="margin:0 0 6px;font-size:12px;color:#57534e;line-height:1.6">
                    <strong>Carrier:</strong> ${escapeHtml(params.carrierName)}
                  </p>
                  <p style="margin:0 0 12px;font-size:12px;color:#57534e;line-height:1.6">
                    <strong>Tracking Number:</strong> <span style="font-family:monospace;color:#b8902a">${escapeHtml(params.trackingNumber)}</span>
                  </p>
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="background:#b8902a;padding:10px 24px">
                        <a href="${url}" style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;text-decoration:none;display:block">
                          Track Your Parcel &rarr;
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- What's next -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">What to Expect</p>
            <p style="margin:0 0 6px;font-size:12px;color:#57534e;line-height:1.6">Standard Tracked 48: typically ${UK_DELIVERY.window} from dispatch.</p>
            <p style="margin:0 0 24px;font-size:12px;color:#57534e;line-height:1.6">Express Tracked 24: typically next working day.</p>

            <p style="margin:0;font-size:13px;color:#57534e;line-height:1.6">
              You can also view this order any time from your <a href="https://www.windsorbeauty.co.uk/account" style="color:#b8902a;text-decoration:none">Windsor Beauty account</a>.
              Questions? Contact us at <a href="mailto:sales@windsorbeauty.co.uk" style="color:#b8902a;text-decoration:none">sales@windsorbeauty.co.uk</a>.
            </p>
          </td>
        </tr>`;

  const html = emailDocument({
    title: `Your order ${params.orderNumber} has been dispatched`,
    headerLabel: 'Order Dispatched',
    bodyHtml,
  });

  return {
    subject: `Your Windsor Beauty order ${params.orderNumber} has been dispatched`,
    text:
      `${emailGreeting(params.customerName)}\n\n` +
      `Your order ${params.orderNumber} is on its way with ${params.carrierName}.\n\n` +
      `Tracking number: ${params.trackingNumber}\n` +
      `Track your parcel: ${url}\n\n` +
      `You can also view this order any time from your Windsor Beauty account at windsorbeauty.co.uk/account.\n\n` +
      `Questions? sales@windsorbeauty.co.uk`,
    html,
  };
}

export async function sendShippingConfirmationEmail(params: ShippingNotificationParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const { subject, text, html } = buildShippingConfirmationEmail(params);

  try {
    const { id, error } = await sendEmail({
      from: FROM_ADDRESS,
      // Replies reach a person. A customer answering an order or payment email was
      // writing into a void, and a From address that refuses replies is a pattern spam
      // filters associate with phishing (invoice junk-folder diagnosis, 31 July 2026).
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject,
      text,
      html,
    }, {
      // Filed under the customer automatically (task ce308493). This says which order it is
      // about and what kind of email it is, so the history reads as English and the orders
      // screen can find the very email it sent.
      filing: { orderRef: params.orderNumber, emailType: 'dispatch' },
    });

    if (error) {
      console.error('Resend error (shipping confirmation):', error);
      return false;
    }
    if (id) {
    }
    return true;
  } catch (err) {
    console.error('Resend send threw (shipping confirmation):', err);
    return false;
  }
}
