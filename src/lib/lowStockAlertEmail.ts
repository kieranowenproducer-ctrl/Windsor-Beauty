import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { sendEmail } from '@/lib/email/send';

// INTERNAL mail , same identity split as adminOrderNotificationEmail.ts:
// ops mail goes out from alerts@, never from the customer-facing addresses,
// per the 31 July 2026 deliverability audit.
const FROM_ADDRESS = 'Windsor Beauty Ops <alerts@windsorbeauty.is>';
const TO_ADDRESS = 'sales@windsorbeauty.is';

const SITE_URL = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.windsorbeauty.is';

export interface LowStockEmailItem {
  slug: string;
  name: string;
  dosage: string;
  quantity: number;
}

// Pure message builder , exported so the rendered output can be inspected
// and tested without sending anything.
export function buildLowStockAlertEmail(items: LowStockEmailItem[], threshold: number): { subject: string; text: string; html: string } {
  const itemRows = items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4;font-size:13px;color:#57534e">
        ${escapeHtml(item.name)} <span style="color:#a8a29e">(${escapeHtml(item.dosage)})</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e7e5e4;text-align:right;font-size:13px;font-weight:bold;color:${item.quantity === 0 ? '#991b1b' : '#A9695D'}">
        ${item.quantity === 0 ? 'SOLD OUT' : `${item.quantity} left`}
      </td>
    </tr>
  `).join('');

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#A9695D">Stock Warning</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">Stock is running low</h1>

            <!-- Action note , what this email is asking for, in plain language -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px">
              <tr>
                <td style="border-left:3px solid #A9695D;background:#fefce8;padding:10px 16px;font-size:12px;color:#57534e;line-height:1.5">
                  ${items.length === 1 ? 'This product has' : 'These products have'} fewer than ${threshold} units left. Order more soon so ${items.length === 1 ? 'it does not' : 'they do not'} sell out.
                </td>
              </tr>
            </table>

            <!-- Low products -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Running Low</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tbody>${itemRows}</tbody>
            </table>

            <!-- Straight to the stock editor -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td class="wb-gold-bg" bgcolor="#A9695D" style="background:#A9695D">
                  <a href="${SITE_URL}/admin/products" class="wb-white-text" style="display:inline-block;padding:12px 28px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;text-decoration:none">
                    Update stock in admin
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:11px;color:#a8a29e;line-height:1.6">
              You will not get another email about ${items.length === 1 ? 'this product' : 'these products'} until the stock is set back to ${threshold} or more and then runs low again. The dashboard always shows the live picture.
            </p>
          </td>
        </tr>`;

  const html = emailDocument({
    title: 'Stock is running low',
    headerLabel: 'Low Stock Warning',
    bodyHtml,
    footerText: 'Internal Stock Alert',
  });

  const soldOutCount = items.filter((i) => i.quantity === 0).length;
  const subject =
    items.length === 1
      ? `Stock low: ${items[0].name} ${items[0].dosage} has ${items[0].quantity === 0 ? 'sold out' : `${items[0].quantity} left`}`
      : `Stock low: ${items.length} products need reordering${soldOutCount ? ` (${soldOutCount} sold out)` : ''}`;

  const text =
    `Stock is running low.\n\n` +
    `${items.length === 1 ? 'This product has' : 'These products have'} fewer than ${threshold} units left:\n\n` +
    items.map((i) => `  ${i.name} (${i.dosage}): ${i.quantity === 0 ? 'SOLD OUT' : `${i.quantity} left`}`).join('\n') +
    `\n\nUpdate stock: ${SITE_URL}/admin/products\n\n` +
    `You will not get another email about ${items.length === 1 ? 'this product' : 'these products'} until the stock is set back to ${threshold} or more and then runs low again.`;

  return { subject, text, html };
}

export async function sendLowStockAlertEmail(items: LowStockEmailItem[], threshold: number): Promise<boolean> {
  if (!process.env.RESEND_API_KEY_BEAUTY_IS?.trim()) return false;
  if (!items.length) return false;

  const { subject, text, html } = buildLowStockAlertEmail(items, threshold);

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
      subject,
      text,
      html,
    }, { internal: true }); /* Internal post: not filed under a customer. */

    if (error) {
      console.error('[lowStockAlertEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[lowStockAlertEmail] send threw:', err);
    return false;
  }
}
