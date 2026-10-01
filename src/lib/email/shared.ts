// Single source of truth for Windsor Glow email branding: colours, the
// dark-mode-safe <head> boilerplate, and the shared dark-glow hero header /
// footer markup every transactional and marketing email renders identically.
//
// Root cause this module exists to fix: only launchEmail.ts previously had
// the `color-scheme`/`supported-color-schemes` meta tags that stop Gmail,
// Apple Mail and Outlook's automatic dark-mode re-colouring from washing out
// an intentionally dark, gold-accented design. Every other template was
// missing them, so in a dark-mode inbox (confirmed on the Gmail app) their
// already-dark header sections got auto-"corrected" — desaturated gold,
// greyed-out near-white text, flattened contrast — while the exact same
// template looked correct in a client that didn't apply that adjustment
// (e.g. Apple Mail). `emailHeadTags()` below pins every template to
// `color-scheme: light only`, which tells dark-mode-aware clients "this
// design is fixed, not a light email needing a dark variant — render the
// literal colours, don't adjust them." The `[data-ogsc]`/`[data-ogsb]` rules
// are the matching guard for the Gmail app specifically, which doesn't
// fully honour those meta tags and instead injects its own recoloured
// values onto elements it decides to adjust; re-asserting the real colour
// `!important` under those Gmail-injected attributes wins back control. The
// `@media (prefers-color-scheme: dark)` block does the same for any other
// client that keys off that media feature instead.

export const EMAIL_COLORS = {
  heroBg: '#16140f',
  gold: '#b8902a',
  cream: '#f3ead9',
  white: '#ffffff',
  headingDark: '#1c1917',
  bodyText: '#57534e',
  muted: '#a8a29e',
  border: '#e7e5e4',
  pageBg: '#f5f5f4',
  cardBg: '#fefce8',
  cardBorder: '#e7dcc8',
} as const;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://windsorglow.com';
export const EMAIL_ICON_BASE = `${SITE_URL}/images/email`;
// Brighter, higher-contrast logo variant used only in email headers — the
// site's main flat-gold logo elsewhere is untouched.
export const EMAIL_LOGO_URL = `${EMAIL_ICON_BASE}/email-logo.png`;

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Drop straight inside <head> in every template, right after charset/viewport.
export function emailHeadTags(title: string): string {
  return `<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(title)}</title>
<style>
  body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  [data-ogsc] .wg-hero-bg, [data-ogsb] .wg-hero-bg { background-color: ${EMAIL_COLORS.heroBg} !important; }
  [data-ogsc] .wg-hero-label { color: ${EMAIL_COLORS.cream} !important; }
  [data-ogsc] .wg-gold-bg, [data-ogsb] .wg-gold-bg { background-color: ${EMAIL_COLORS.gold} !important; }
  [data-ogsc] .wg-gold-text { color: ${EMAIL_COLORS.gold} !important; }
  [data-ogsc] .wg-white-text { color: ${EMAIL_COLORS.white} !important; }
  @media (prefers-color-scheme: dark) {
    .wg-hero-bg { background-color: ${EMAIL_COLORS.heroBg} !important; }
    .wg-hero-label { color: ${EMAIL_COLORS.cream} !important; }
    .wg-gold-bg { background-color: ${EMAIL_COLORS.gold} !important; }
    .wg-gold-text { color: ${EMAIL_COLORS.gold} !important; }
    .wg-white-text { color: ${EMAIL_COLORS.white} !important; }
  }
</style>`;
}

// The premium dark-glow hero header every Windsor Glow email shares — logo,
// an uppercase label between two hairlines, and a short gold underline, over
// the same background-glow image at the same dark overlay opacity. `label`
// is the only thing that changes between templates (Invoice / Order
// Confirmation / Order Dispatched / Welcome / Password Reset / ...).
//
// The label must be allowed to WRAP (task 21fabb4e): with nowrap, a long
// label ("The August £100 Winner Is Announced") gives the whole email a
// minimum width wider than a phone, so phone mail apps and the admin
// preview lay it out cut off at the right edge. A short label still sits on
// one line exactly as before — wrapping only happens when it cannot fit.
export function emailHeaderHtml(label: string): string {
  return `<tr>
  <td class="wg-hero-bg" bgcolor="${EMAIL_COLORS.heroBg}" background="${EMAIL_ICON_BASE}/header-glow.png" style="background-color:${EMAIL_COLORS.heroBg}; background-image:linear-gradient(to bottom, rgba(22,20,15,0.97) 0%, rgba(22,20,15,0.93) 38%, rgba(22,20,15,0.7) 60%, rgba(22,20,15,0.5) 75%, rgba(22,20,15,0.45) 100%), url('${EMAIL_ICON_BASE}/header-glow.png'); background-size:100% 100%, cover; background-position:center top, center top; background-repeat:no-repeat, no-repeat; padding:34px 40px 28px; text-align:center;">
    <img src="${EMAIL_LOGO_URL}" alt="Windsor Glow" width="170" height="61" style="display:block;margin:0 auto 18px;border:0;outline:none;width:170px;height:61px" />
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr>
        <td style="border-top:1px solid #57503f; width:40px; line-height:0; font-size:0;">&nbsp;</td>
        <td class="wg-hero-label" style="padding:0 12px; text-align:center; font-size:12px; letter-spacing:0.3em; text-transform:uppercase; color:${EMAIL_COLORS.cream};">${escapeHtml(label)}</td>
        <td style="border-top:1px solid #57503f; width:40px; line-height:0; font-size:0;">&nbsp;</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px auto 0;">
      <tr><td class="wg-gold-bg" bgcolor="${EMAIL_COLORS.gold}" style="width:56px; height:2px; background:${EMAIL_COLORS.gold}; line-height:0; font-size:0;">&nbsp;</td></tr>
    </table>
  </td>
</tr>`;
}

// Shared footer band — `footerText` overrides the default research-use
// disclaimer (e.g. the internal admin notification email has no need for
// it). `brandLine` overrides the "Windsor Glow — windsorglow.com" line —
// only used by paypalInstructionsEmail.ts, which sends under the
// still-unresolved "Windsor Beauty" brand mismatch (see that file) and would
// otherwise show a self-contradictory footer. `senderNotice` is the
// do-not-reply line marketing broadcasts carry when they go out from the
// unmonitored no-reply address (task 286b1863); it sits above the brand line
// and is absent from every transactional email, which IS reply-able.
export function emailFooterHtml(
  footerText?: string | null,
  brandLine?: string | null,
  senderNotice?: string | null
): string {
  return `<tr>
  <td bgcolor="${EMAIL_COLORS.pageBg}" style="background:${EMAIL_COLORS.pageBg};padding:20px 40px;text-align:center;border-top:1px solid ${EMAIL_COLORS.border}">
    ${senderNotice ? `<p style="margin:0 0 8px;font-size:10px;line-height:1.6;color:${EMAIL_COLORS.muted}">${escapeHtml(senderNotice)}</p>` : ''}
    <p style="margin:0 0 4px;font-size:10px;color:${EMAIL_COLORS.muted}">${brandLine || 'Windsor Glow &mdash; windsorglow.com'}</p>
    <p style="margin:0;font-size:10px;color:#d4cfc9">${escapeHtml(footerText || 'All products are supplied strictly for research purposes only. Not for human use.')}</p>
  </td>
</tr>`;
}

// Wraps body content (already-built HTML for the rows between header and
// footer) in the shared outer page background + 600px white card every
// template uses — the literal `<!DOCTYPE html>`/`<head>`/page-background
// boilerplate that was duplicated, slightly differently, in every file.
export function emailDocument(params: {
  title: string;
  headerLabel: string;
  bodyHtml: string;
  footerText?: string | null;
  footerBrandLine?: string | null;
  preheader?: string;
  afterTableHtml?: string;
  /** Extra markup (e.g. a responsive @media <style> block) injected into <head>, after the shared dark-mode-safe tags. */
  extraHeadHtml?: string;
  /** Do-not-reply line for no-reply marketing sends — see emailFooterHtml. */
  senderNotice?: string | null;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${emailHeadTags(params.title)}
${params.extraHeadHtml || ''}
</head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.pageBg};font-family:Arial,Helvetica,sans-serif">
  ${params.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(params.preheader)}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="${EMAIL_COLORS.pageBg}" style="background:${EMAIL_COLORS.pageBg};padding:32px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;max-width:600px;width:100%">
        ${emailHeaderHtml(params.headerLabel)}
        ${params.bodyHtml}
        ${emailFooterHtml(params.footerText, params.footerBrandLine, params.senderNotice)}
      </table>
      ${params.afterTableHtml || ''}
    </td></tr>
  </table>
</body>
</html>`;
}
