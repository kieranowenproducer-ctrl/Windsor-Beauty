import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { resolveMarketingSender, type MarketingSenderKey } from '@/lib/email/marketingSender';
import { sendEmail } from '@/lib/email/send';

// Which address a campaign goes out from is chosen per send in the dashboard
// and resolved by lib/email/marketingSender.ts — no-reply by default, the
// Beautiful@ marketing address on request (task 286b1863). Resend can still be
// pointed at a separate marketing key/domain via env without touching code.
const RESEND_API_KEY = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY;

// Admin writes plain text in the campaign composer — escape it for safety,
// then turn blank-line-separated paragraphs into <p> tags (and single line
// breaks within a paragraph into <br>) so simple formatting carries through
// to the email without allowing arbitrary HTML/script injection.
export function formatMarketingBody(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p style="margin:0 0 16px;font-size:13px;color:#57534e;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Inverse of formatMarketingBody, for campaigns sent before the raw text was
// stored (task 842923ab): turns the stored paragraph HTML back into the
// blank-line-separated plain text the composer edits. Exact for anything
// formatMarketingBody produced; best-effort for anything else.
export function marketingBodyToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The gold button and the band above the logo used to be welded into this
// template: every campaign said "Shop Now", pointed at the shop, and was
// labelled "Special Offer". That is wrong for any campaign that is not selling
// something — a review request sends its readers shopping instead of reviewing.
// They are now chosen per campaign, and these remain the defaults, so every
// campaign written before this change looks exactly as it always did.
export const MARKETING_CTA_DEFAULTS = {
  label: 'Shop Now',
  url: 'https://windsorglow.com/shop',
  headerLabel: 'Special Offer',
} as const;

/**
 * Settle the button and band for one campaign.
 *
 * Blank means "use the default", never "render an empty button". The link is
 * only accepted as an ordinary http(s) web address: anything else (a
 * javascript: URL, a typo, a mailto) falls back to the shop rather than
 * shipping a broken or dangerous button to the whole list.
 */
export function resolveMarketingCta(input?: {
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  headerLabel?: string | null;
}): { label: string; url: string; headerLabel: string } {
  const label = (input?.ctaLabel ?? '').trim().slice(0, 40) || MARKETING_CTA_DEFAULTS.label;
  const headerLabel = (input?.headerLabel ?? '').trim().slice(0, 40) || MARKETING_CTA_DEFAULTS.headerLabel;

  const raw = (input?.ctaUrl ?? '').trim();
  let url: string = MARKETING_CTA_DEFAULTS.url;
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = parsed.toString();
    } catch {
      /* not a URL at all — keep the default */
    }
  }
  return { label, url, headerLabel };
}

export interface MarketingEmailRenderParams {
  subject: string;
  bodyHtml: string;
  unsubscribeUrl: string;
  /** Which address this send goes from. Omitted = the no-reply default. */
  sender?: MarketingSenderKey;
  /** Words on the gold button. Blank = "Shop Now". */
  ctaLabel?: string | null;
  /** Where the gold button goes. Blank = the shop. */
  ctaUrl?: string | null;
  /** The band above the logo. Blank = "Special Offer". */
  headerLabel?: string | null;
}

// Branded structure shared with orderConfirmationEmail.ts / shippingEmail.ts —
// same header/body/footer styling so marketing emails feel consistent with
// transactional ones. `bodyHtml` is pre-rendered (see formatMarketingBody)
// and inserted directly into the body section.
export function renderMarketingEmailHtml(params: MarketingEmailRenderParams): string {
  const cta = resolveMarketingCta(params);
  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#b8902a">From Windsor Glow</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">${escapeHtml(params.subject)}</h1>

            ${params.bodyHtml}

            <table cellpadding="0" cellspacing="0" style="margin-top:8px">
              <tr>
                <td style="background:#b8902a">
                  <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 32px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;text-decoration:none">${escapeHtml(cta.label)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

  // Same shared emailDocument/emailFooterHtml every other transactional
  // email uses — previously this hand-rolled the entire document and
  // footer (a second, independent copy alongside launchEmail.ts's). The
  // unsubscribe line is genuinely unique to this template, so it goes in
  // afterTableHtml (below the card, on the page background) rather than
  // forcing the shared footer to carry an HTML link through its
  // escaped-text-only footerText param.
  return emailDocument({
    title: params.subject,
    headerLabel: cta.headerLabel,
    bodyHtml,
    senderNotice: resolveMarketingSender(params.sender).notice,
    afterTableHtml: `
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td style="padding:12px 40px 0;text-align:center">
          <p style="margin:0;font-size:10px;color:#d4cfc9">
            You are receiving this email because you opted in to Windsor Glow offers and updates.
            <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#a8a29e;text-decoration:underline">Unsubscribe</a>
          </p>
        </td></tr>
      </table>`,
  });
}

export interface SendMarketingEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  unsubscribeUrl: string;
  /** Raw campaign copy (before HTML formatting), used to build the plain-text part. */
  text?: string;
  /** Which address this send goes from. Omitted = the no-reply default. */
  sender?: MarketingSenderKey;
  /** Words on the gold button. Blank = "Shop Now". */
  ctaLabel?: string | null;
  /** Where the gold button goes. Blank = the shop. */
  ctaUrl?: string | null;
  /** The band above the logo. Blank = "Special Offer". */
  headerLabel?: string | null;
}

export async function sendMarketingEmail(params: SendMarketingEmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  const senderChoice = resolveMarketingSender(params.sender);
  const html = renderMarketingEmailHtml(params);

  // One-click List-Unsubscribe (RFC 8058). Required by Gmail/Yahoo bulk-sender
  // rules and a strong positive trust signal, so marketing lands in the inbox
  // rather than spam. Gmail POSTs the literal body "List-Unsubscribe=One-Click"
  // (not the token) to the URL, so the header must point at a POST endpoint that
  // reads the token from the query — /api/marketing/unsubscribe accepts that.
  // Transactional emails intentionally do NOT get this header.
  const token = (() => {
    try { return new URL(params.unsubscribeUrl).searchParams.get('token') || ''; } catch { return ''; }
  })();
  const oneClickUrl = token
    ? `https://windsorglow.com/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`
    : params.unsubscribeUrl;
  const headers = {
    'List-Unsubscribe': `<${oneClickUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
  // Plain-text alternative — a missing text part is a mild spam signal; include
  // the raw copy plus the unsubscribe link so text-only clients are covered.
  // The do-not-reply notice goes in here too, so a text-only reader gets the
  // same warning the HTML footer carries.
  const cta = resolveMarketingCta(params);
  const text = params.text?.trim()
    ? [
        params.text.trim(),
        // The button is a picture to a text-only reader, so spell it out.
        // Without this the one link that matters is simply missing for them.
        `${cta.label}: ${cta.url}`,
        '---',
        ...(senderChoice.notice ? [senderChoice.notice] : []),
        'You are receiving this because you opted in to Windsor Glow offers and updates.',
        `Unsubscribe: ${params.unsubscribeUrl}`,
      ].join('\n\n')
    : undefined;

  try {
    const { error } = await sendEmail({
      from: senderChoice.from,
      replyTo: senderChoice.replyTo,
      to: params.to,
      subject: params.subject,
      html,
      ...(text ? { text } : {}),
      headers,
    });

    if (error) {
      console.error('[marketingEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[marketingEmail] send threw:', err);
    return false;
  }
}
