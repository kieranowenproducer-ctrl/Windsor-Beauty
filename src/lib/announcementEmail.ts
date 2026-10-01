import { bulkUnsubscribeFor, textFromHtml } from './email/bulkHeaders';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { resolveMarketingSender, type MarketingSenderKey } from '@/lib/email/marketingSender';
import { sendEmail } from '@/lib/email/send';

// Subscriber announcement email (task 04a236c9). A reusable, admin-editable
// broadcast: the draft (subject/headline/body) lives in site_content under
// 'subscriber-announcement' and is edited from the dashboard's Pre-Launch
// card; this module only renders and sends whatever the current draft says.
// Same marketing sender convention as launchEmail.ts / marketingEmail.ts: the
// address is chosen per send and resolved by lib/email/marketingSender.ts,
// defaulting to no-reply (task 286b1863).
const RESEND_API_KEY = process.env.RESEND_API_KEY_MARKETING || process.env.RESEND_API_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://windsorglow.com';

export interface AnnouncementDraft {
  id: string;
  /** Short label shown in the drafts list, e.g. "Go-live announcement". */
  name: string;
  subject: string;
  headline: string;
  /** Plain text; blank lines split paragraphs. */
  body: string;
  updatedAt: string;
}

// There is deliberately no seed draft.
//
// This used to fall back to a hardcoded "We go live this Wednesday at 11am"
// announcement whenever the saved list was empty. That made the draft
// UNDELETABLE — the dashboard's Delete button saved an empty list, the loader
// immediately re-seeded the same draft, and it reappeared on the next render
// looking as though the delete had silently failed. Worse, after go-live on
// 2026-07-29 that draft was factually wrong and still sat one click away from
// a Send button that would have told every subscriber the site was opening
// on a day that had already passed.
//
// Empty now means empty. The campaign manager shows an empty state and the
// "New draft" button, so nothing is lost.

function normaliseDraft(value: unknown): AnnouncementDraft | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Record<string, unknown>;
  const subject = typeof d.subject === 'string' ? d.subject.trim() : '';
  const headline = typeof d.headline === 'string' ? d.headline.trim() : '';
  const body = typeof d.body === 'string' ? d.body.trim() : '';
  if (!subject && !headline && !body) return null;
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `draft-${Math.random().toString(36).slice(2, 10)}`,
    name: (typeof d.name === 'string' && d.name.trim()) || subject || 'Untitled draft',
    subject: subject || 'Untitled',
    headline: headline || subject || 'Untitled',
    body,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
  };
}

// Stored shape: { drafts: AnnouncementDraft[] }. Older builds stored one bare
// draft object; both parse to a list, and an empty store seeds the launch draft.
export function parseAnnouncementDrafts(raw: string | null | undefined): AnnouncementDraft[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.drafts) ? parsed.drafts : [parsed];
    return list.map(normaliseDraft).filter((d: AnnouncementDraft | null): d is AnnouncementDraft => d !== null);
  } catch {
    return [];
  }
}

export function renderAnnouncementHtml(draft: AnnouncementDraft, sender?: MarketingSenderKey): string {
  const paragraphs = draft.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 20px;font-size:13px;color:#57534e;line-height:1.8">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('\n            ');

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td class="wg-body-pad" style="padding:40px 40px 32px;text-align:center">
            <p style="margin:0 0 8px;font-size:9px;font-weight:bold;letter-spacing:0.3em;text-transform:uppercase;color:#b8902a">An Announcement From Windsor Glow</p>
            <h1 class="wg-headline" style="margin:0 0 26px;font-size:26px;font-weight:bold;color:#1c1917;letter-spacing:0.01em;line-height:1.3">${escapeHtml(draft.headline)}</h1>
            ${paragraphs}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 8px">
              <tr>
                <td bgcolor="#b8902a" style="background:#b8902a; border-radius:4px;">
                  <a href="${SITE_URL}" style="display:inline-block;padding:14px 36px;font-size:11px;font-weight:bold;letter-spacing:0.2em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                    Visit Windsor Glow&nbsp;&nbsp;&rsaquo;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

  return emailDocument({
    title: draft.subject,
    headerLabel: 'Announcement',
    bodyHtml,
    preheader: draft.headline,
    senderNotice: resolveMarketingSender(sender).notice,
    extraHeadHtml: `<style>
  @media only screen and (max-width: 480px) {
    .wg-body-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .wg-headline { font-size: 22px !important; }
  }
</style>`,
  });
}

export async function sendAnnouncementEmail(
  to: string,
  draft: AnnouncementDraft,
  options?: { subjectPrefix?: string; sender?: MarketingSenderKey }
): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const senderChoice = resolveMarketingSender(options?.sender);
  try {
    // Bulk mail, so it carries a way out. Without one the only exit is the Junk button, and
    // every press of that is a complaint against windsorglow.com that transactional mail
    // then pays for. See lib/email/bulkHeaders.ts.
    const unsub = await bulkUnsubscribeFor(to);
    const html = renderAnnouncementHtml(draft, senderChoice.key);
    const { error } = await sendEmail({
      from: senderChoice.from,
      replyTo: senderChoice.replyTo,
      to,
      subject: `${options?.subjectPrefix ?? ''}${draft.subject}`,
      html,
      text: textFromHtml(html, unsub.url),
      headers: unsub.headers,
    });
    if (error) {
      console.error('[announcementEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[announcementEmail] send threw:', err);
    return false;
  }
}
