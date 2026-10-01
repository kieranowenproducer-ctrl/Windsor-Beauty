// Unsubscribe machinery for bulk email.
//
// WHY THIS EXISTS. The launch and announcement blasts went to the whole signup list on
// 29 July 2026 with no unsubscribe header and no unsubscribe link in the body. When the only
// way out of a mailing list is the Junk button, that is the button people press, and every
// press is a complaint recorded against windsorbeauty.co.uk. Transactional mail then inherits the
// damage: on 31 July a customer's invoice landed in their junk folder. Marketing complaints
// and invoice deliverability are the same reputation.
//
// The marketing sender already did this properly. This makes the same mechanism available to
// the other two bulk paths rather than leaving one correct implementation and two without.
import { findMarketingContactByEmail } from '../db/marketing';

export interface BulkUnsubscribe {
  /** RFC 8058 headers for the send call. */
  headers: Record<string, string>;
  /** Human-clickable URL, or a mailto when the recipient has no contact row. */
  url: string;
  /** True when a real one-click token was found. */
  oneClick: boolean;
}

const MAILTO = 'mailto:sales@windsorbeauty.co.uk?subject=Unsubscribe';

/**
 * Build the unsubscribe route for one recipient.
 *
 * Falls back to a mailto, which RFC 8058 explicitly allows, rather than omitting the header:
 * a mailto is worth far more than nothing, and a bulk send with no mechanism at all is what
 * Gmail and Yahoo now penalise outright.
 */
export async function bulkUnsubscribeFor(email: string): Promise<BulkUnsubscribe> {
  const contact = await findMarketingContactByEmail(email).catch(() => null);
  const token = contact?.unsubscribe_token ?? '';
  if (!token) {
    return {
      headers: { 'List-Unsubscribe': `<${MAILTO}>` },
      url: MAILTO,
      oneClick: false,
    };
  }
  const oneClickUrl = `https://www.windsorbeauty.co.uk/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    headers: {
      // The URL first: Gmail POSTs to the first https entry it finds.
      'List-Unsubscribe': `<${oneClickUrl}>, <${MAILTO}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    url: `https://www.windsorbeauty.co.uk/unsubscribe?token=${encodeURIComponent(token)}`,
    oneClick: true,
  };
}

/**
 * A plain-text alternative derived from the HTML.
 *
 * A message with no text part is a mild spam signal on its own and a strong one in
 * combination with anything else, and all three bulk emails were HTML only. Bespoke copy
 * would read better; this is the version that is guaranteed to exist and stay in step with
 * the HTML rather than drifting from it.
 */
export function textFromHtml(html: string, unsubscribeUrl?: string): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '  - ')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) =>
      `${String(label).replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '-')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .join('\n');
  return unsubscribeUrl ? `${text}\n\n---\nUnsubscribe: ${unsubscribeUrl}` : text;
}
