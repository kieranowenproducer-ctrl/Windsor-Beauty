import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { parsePearlReply, pearlReplyPlainText, type ParsedPearlReply } from '@/lib/email/pearlReplyTemplate';

// THE ONE PLACE A PEARL EMAIL IS DRAWN (task 9add1201).
//
// Kieran: "Any emails drafted on PEARL's dashboard must look identical to how
// they appear to a customer with the background etc. Ensure this is always
// standard."
//
// The only way to guarantee identical is to have one renderer. This markup used
// to live inside the enquiry reply route, and a second copy of it on the drafts
// screen is precisely how a preview and a real email drift apart. The enquiry
// reply, the draft preview and the draft send now all call this, so a difference
// between them is not possible.
//
// Lifted out unchanged, so the emails the enquiry route already sends are
// byte-for-byte what they were.

function paragraphsHtml(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 18px;font-size:13px;color:#57534e;line-height:1.7;font-family:Arial">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function pearlCopyHtml(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length > 0 && lines.every((line) => line.startsWith('- '))) {
        const rows = lines.map((line) => {
          const item = line.slice(2);
          const colon = item.indexOf(':');
          const label = colon >= 0 ? item.slice(0, colon).trim() : item;
          const value = colon >= 0 ? item.slice(colon + 1).trim() : '';
          return `<tr>
            <td style="padding:9px 10px;border-bottom:1px solid #eadfca;color:#786f65;font-size:11px;line-height:1.4;font-family:Arial">${escapeHtml(label)}</td>
            <td style="padding:9px 10px;border-bottom:1px solid #eadfca;color:#292524;font-size:11px;line-height:1.4;font-weight:bold;text-align:right;font-family:Arial">${escapeHtml(value)}</td>
          </tr>`;
        }).join('');
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#ffffff;border:1px solid #eadfca">${rows}</table>`;
      }
      return paragraphsHtml(block);
    })
    .join('');
}

export function pearlAnswerHtml(parsed: ParsedPearlReply): string {
  const lines = parsed.pearl.split('\n');
  const title = lines.shift()?.trim() || 'PEARL research answer';
  const copy = lines.join('\n').trim();
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 26px;border:1px solid #e7dcc8;border-top:3px solid #b8902a;background:#fefce8;border-radius:10px">
      <tr>
        <td style="padding:18px 20px 15px;border-bottom:1px solid #eadfca">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td width="34" height="34" bgcolor="#f4e8bd" style="width:34px;height:34px;border-radius:50%;text-align:center;color:#946d13;font-family:Georgia,serif;font-size:18px;font-weight:bold">P</td>
            <td style="padding-left:12px">
              <p style="margin:0;color:#8a681b;font-size:10px;line-height:1.2;font-weight:bold;letter-spacing:0.22em;font-family:Arial">PEARL</p>
              <p style="margin:4px 0 0;color:#8b8277;font-size:10px;line-height:1.35;font-family:Arial">Peptide Experimental Analysis Research Library</p>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:19px 20px 2px">
          <p style="margin:0 0 8px;color:#9a741d;font-size:9px;line-height:1.2;font-weight:bold;letter-spacing:0.16em;font-family:Arial">SOURCE-LISTED ANSWER</p>
          <p style="margin:0 0 12px;color:#292524;font-family:Georgia,serif;font-size:20px;line-height:1.25">${escapeHtml(title)}</p>
          ${pearlCopyHtml(copy)}
        </td>
      </tr>
    </table>`;
}

/** The customer's own words, quoted back. Only used when replying to an enquiry. */
export function quotedMessageHtml(message: string): string {
  return `
    <div style="margin:28px 0 0;padding:14px 18px;border-left:3px solid #e7dcc8;background:#faf9f7">
      <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;font-family:Arial">
        Your message
      </p>
      <p style="margin:0;white-space:pre-wrap;font-size:12px;color:#78716c;font-family:Arial">${escapeHtml(message)}</p>
    </div>`;
}

export const PEARL_EMAIL_SUBJECT = 'Your question — Windsor Glow';

export interface PearlEmailRender {
  subject: string;
  html: string;
  text: string;
}

/**
 * The finished PEARL email: black header, gold PEARL box, research-use footer.
 *
 * `message` is the whole letter with the PEARL RESPONSE markers still in it,
 * exactly as buildPearlReplyTemplate produces it. Returns null when the markers
 * are missing, because there would be no answer to put in the box and sending a
 * half-built letter to a customer is worse than refusing.
 */
export function renderPearlEmail(params: {
  message: string;
  subject?: string;
  quotedMessage?: string | null;
}): PearlEmailRender | null {
  const parsed = parsePearlReply(params.message);
  if (!parsed) return null;

  const subject = params.subject?.trim() || PEARL_EMAIL_SUBJECT;
  const quoted = params.quotedMessage ? quotedMessageHtml(params.quotedMessage) : '';

  return {
    subject,
    text:
      `${pearlReplyPlainText(parsed)}\n\n` +
      `— Windsor Glow\nwindsorglow.com\n\n` +
      `All products are supplied strictly for research purposes only. Not for human use.` +
      (params.quotedMessage ? `\n\n--- Your original message ---\n${params.quotedMessage}\n` : '\n'),
    html: emailDocument({
      title: subject,
      headerLabel: 'Product information',
      // No footerText override, deliberately: the shared default is the one
      // that carries the research-use disclaimer (task 8a498491).
      bodyHtml: `
        <tr>
          <td style="padding:40px 40px 32px">
            ${paragraphsHtml(parsed.before)}
            ${pearlAnswerHtml(parsed)}
            ${paragraphsHtml(parsed.after)}
            ${quoted}
          </td>
        </tr>`,
    }),
  };
}
