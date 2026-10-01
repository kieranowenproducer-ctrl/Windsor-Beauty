import { bulkUnsubscribeFor, textFromHtml } from './email/bulkHeaders';
import { EMAIL_ICON_BASE, emailDocument, escapeHtml } from '@/lib/email/shared';
import { resolveMarketingSender, type MarketingSenderKey } from '@/lib/email/marketingSender';
import { sendEmail } from '@/lib/email/send';

// Same from-address/key convention as marketingEmail.ts — this is an
// announcement sent to people who opted in on the pre-launch coming-soon
// page, so it follows the marketing sender rather than the transactional one:
// chosen per send in the dashboard, no-reply by default (task 286b1863).
const RESEND_API_KEY = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';
const ICON_BASE = EMAIL_ICON_BASE;

export const LAUNCH_EMAIL_SUBJECT = 'Windsor Beauty is now live';

// Real hosted PNGs (rasterised once from the same line-icon style used on
// the homepage) rather than inline <svg> — Gmail's sanitiser strips inline
// SVG inconsistently across web/iOS/Android, which is what made the
// previous version of this email look broken in real inboxes despite
// rendering correctly in a browser preview. A plain <img> against a hosted
// URL is the one icon technique every email client supports.
function icon(name: string, size: number, alt = '') {
  return `<img src="${ICON_BASE}/${name}.png" width="${size}" height="${size}" alt="${alt}" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;" />`;
}

const TRUST_BADGES = [
  { icon: 'ribbon', label: 'Premium<br/>Quality' },
  { icon: 'shieldCheck', label: 'Secure<br/>Checkout' },
  { icon: 'truck', label: 'UK<br/>Delivery' },
  { icon: 'headset', label: 'Dedicated<br/>Support' },
];

function trustBadgesRow(): string {
  const cells = TRUST_BADGES.map(
    (badge, i) => `
                <td width="25%" align="center" style="padding:0 6px; ${i > 0 ? 'border-left:1px solid #efeae0;' : ''}">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 8px;"><tr><td>${icon(badge.icon, 22, badge.label.replace('<br/>', ' '))}</td></tr></table>
                  <p style="margin:0; font-size:9px; line-height:1.5; letter-spacing:0.08em; text-transform:uppercase; color:#78716c;">${badge.label}</p>
                </td>`
  ).join('');
  return `
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
              <tr>${cells}
              </tr>
            </table>`;
}

function renderLaunchEmailHtml(discountCode: string | null, sender?: MarketingSenderKey): string {
  const discountBlock = discountCode
    ? `
            <p style="margin:0; font-size:14px; font-weight:bold; color:#1c1917; line-height:1.6;">As a thank-you for signing up early,</p>
            <p style="margin:0; font-size:14px; font-weight:bold; color:#1c1917; line-height:1.6;">here is your unique <span style="color:#AD8E54;">10% discount code</span></p>
            <p style="margin:0 0 20px; font-size:14px; font-weight:bold; color:#1c1917; line-height:1.6;">for your first order:</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td class="wb-code-box" bgcolor="#fffdf9" style="border:1.5px solid #AD8E54; background:#fffdf9; padding:22px 14px; text-align:center;">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                    <tr><td bgcolor="#AD8E54" style="width:38px; height:38px; background:#AD8E54; border-radius:50%; text-align:center; vertical-align:middle;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" height="38"><tr><td align="center" valign="middle">${icon('gift', 18, 'Gift')}</td></tr></table>
                    </td></tr>
                  </table>
                  <p class="wb-code" style="margin:0 0 10px; font-size:21px; font-weight:bold; letter-spacing:0.5px; color:#AD8E54; white-space:nowrap; -webkit-user-select:text; user-select:text;">${escapeHtml(discountCode)}</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
                    <td style="font-size:10px; letter-spacing:0.08em; color:#a8a29e; padding-right:5px;">Tap and hold to copy your code</td>
                  </tr></table>
                </td>
              </tr>
            </table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td bgcolor="#faf6ee" style="background:#faf6ee; padding:16px 18px;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="vertical-align:top; padding-right:12px;">${icon('shieldLock', 22, 'Secure')}</td>
                      <td style="font-size:12px; color:#57534e; line-height:1.6; text-align:left;">
                        Thank you for being part of the Windsor Beauty community.<br/>We are delighted to have you with us.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>`
    : '';

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td class="wb-body-pad" style="padding:40px 40px 32px;text-align:center">
            <p style="margin:0 0 8px;font-size:9px;font-weight:bold;letter-spacing:0.3em;text-transform:uppercase;color:#AD8E54">The Wait Is Over</p>
            <h1 class="wb-headline" style="margin:0 0 24px;font-size:30px;font-weight:bold;color:#1c1917;letter-spacing:0.01em;line-height:1.25">Windsor Beauty is now live.</h1>

            <p style="margin:0 0 28px;font-size:13px;color:#57534e;line-height:1.7">
              Thank you for signing up ahead of launch. The full Windsor Beauty site is open now,
              with the complete range ready to order.
            </p>
${discountBlock}

            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 32px">
              <tr>
                <td bgcolor="#AD8E54" style="background:#AD8E54; border-radius:4px;">
                  <a href="${SITE_URL}" style="display:inline-block;padding:14px 36px;font-size:11px;font-weight:bold;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                    Visit Windsor Beauty
                  </a>
                </td>
              </tr>
            </table>

            ${trustBadgesRow()}
          </td>
        </tr>`;

  // Same shared emailDocument/emailFooterHtml every other transactional and
  // marketing email uses — previously this hand-rolled the entire document
  // and footer, which had drifted slightly from the canonical footer text
  // (and would drift further any time that text changed elsewhere). Only
  // this template's own responsive @media rules (mobile font/padding
  // tweaks for the headline/code box) are genuinely unique to it, so those
  // alone go into extraHeadHtml rather than being duplicated wholesale.
  return emailDocument({
    title: LAUNCH_EMAIL_SUBJECT,
    headerLabel: 'We Are Live',
    bodyHtml,
    preheader: discountCode
      ? 'Windsor Beauty is now live. Here is your 10% first-order code.'
      : 'Windsor Beauty is now live. The full range is ready to order.',
    senderNotice: resolveMarketingSender(sender).notice,
    extraHeadHtml: `<style>
  @media only screen and (max-width: 480px) {
    .wb-body-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .wb-headline { font-size: 25px !important; }
    .wb-code { font-size: 18px !important; letter-spacing: 0.2px !important; }
    .wb-code-box { padding-left: 8px !important; padding-right: 8px !important; }
  }
</style>`,
  });
}

export async function sendLaunchEmail(
  to: string,
  discountCode: string | null = null,
  options?: { subjectPrefix?: string; sender?: MarketingSenderKey }
): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  const senderChoice = resolveMarketingSender(options?.sender);

  try {
    // Same reasoning as the announcement send: bulk mail must offer a way out that is not
    // the Junk button. See lib/email/bulkHeaders.ts.
    const unsub = await bulkUnsubscribeFor(to);
    const html = renderLaunchEmailHtml(discountCode, senderChoice.key);
    const { error } = await sendEmail({
      from: senderChoice.from,
      replyTo: senderChoice.replyTo,
      to,
      subject: `${options?.subjectPrefix ?? ''}${LAUNCH_EMAIL_SUBJECT}`,
      html,
      text: textFromHtml(html, unsub.url),
      headers: unsub.headers,
    });

    if (error) {
      console.error('[launchEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[launchEmail] send threw:', err);
    return false;
  }
}
