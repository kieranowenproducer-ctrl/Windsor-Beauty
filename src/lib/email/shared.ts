import { beautyOperationalAddress } from '@/lib/operationalAddress';
import tailwindConfig from '../../../tailwind.config.js';

// Use the same Blush and Plum colours as the shop.
const palette = tailwindConfig.theme!.extend!.colors as { white: string; gold: Record<number, string>; stone: Record<number, string> };

export const EMAIL_COLORS = {
  heroBg: palette.white,
  gold: palette.gold[700],
  cream: palette.stone[50],
  white: palette.white,
  headingDark: palette.stone[900],
  bodyText: palette.stone[700],
  muted: palette.stone[600],
  border: palette.stone[200],
  pageBg: palette.stone[50],
  cardBg: palette.gold[50],
  cardBorder: palette.gold[200],
  rose: palette.gold[400],
} as const;

const SITE_URL = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.windsorbeauty.is';
function brandDomain(): string {
  try {
    const host = new URL(SITE_URL).hostname.replace(/^www\./, '');
    if (host === 'windsorbeauty.is') return host;
  } catch { /* A local preview still uses the public brand name. */ }
  return 'windsorbeauty.is';
}
export const EMAIL_ICON_BASE = `${SITE_URL}/images/email`;
// Approved Windsor Beauty logo, resized for email.
export const EMAIL_LOGO_URL = `${EMAIL_ICON_BASE}/email-logo-20261001.png`;

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
  .wb-card { color: ${EMAIL_COLORS.bodyText}; }
  img { max-width:100%; }
  a { overflow-wrap:anywhere; }
  @media only screen and (max-width:480px) { .wb-body-pad { padding-left:18px !important; padding-right:18px !important; } }
  body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  [data-ogsc] .wb-hero-bg, [data-ogsb] .wb-hero-bg { background-color: ${EMAIL_COLORS.heroBg} !important; }
  [data-ogsc] .wb-hero-label { color: ${EMAIL_COLORS.gold} !important; }
  [data-ogsc] .wb-gold-bg, [data-ogsb] .wb-gold-bg { background-color: ${EMAIL_COLORS.gold} !important; }
  [data-ogsc] .wb-gold-text { color: ${EMAIL_COLORS.gold} !important; }
  [data-ogsc] .wb-white-text { color: ${EMAIL_COLORS.white} !important; }
  @media (prefers-color-scheme: dark) {
    .wb-hero-bg { background-color: ${EMAIL_COLORS.heroBg} !important; }
    .wb-hero-label { color: ${EMAIL_COLORS.gold} !important; }
    .wb-gold-bg { background-color: ${EMAIL_COLORS.gold} !important; }
    .wb-gold-text { color: ${EMAIL_COLORS.gold} !important; }
    .wb-white-text { color: ${EMAIL_COLORS.white} !important; }
  }
</style>`;
}

// A cream header keeps the approved dark-gold logo legible.
export function emailHeaderHtml(label: string): string {
  return `<tr><td class="wb-hero-bg" bgcolor="${EMAIL_COLORS.heroBg}" style="background:${EMAIL_COLORS.heroBg};padding:30px 24px 24px;text-align:center;border-top:5px solid ${EMAIL_COLORS.gold}">
    <img src="${EMAIL_LOGO_URL}" alt="Windsor Beauty" width="260" height="63" style="display:block;margin:0 auto 22px;border:0;outline:none;width:260px;max-width:100%;height:auto" />
    <p class="wb-hero-label" style="margin:0;font-size:13px;line-height:1.6;letter-spacing:0.14em;text-transform:uppercase;color:${EMAIL_COLORS.gold}">${escapeHtml(label)}</p>
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:14px auto 0"><tr><td bgcolor="${EMAIL_COLORS.rose}" style="width:56px;height:3px;background:${EMAIL_COLORS.rose};font-size:0;line-height:0">&nbsp;</td></tr></table>
  </td></tr>`;
}

// Shared footer band. `footerText` is an optional extra line under the brand
// line (an invoice's own footer, or "Internal Stock Alert" on staff post);
// with none supplied the footer is the brand line alone. `brandLine`
// overrides the "Windsor Beauty, windsorbeauty.co.uk" line. `senderNotice` is the
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
    ${senderNotice ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${EMAIL_COLORS.muted}">${escapeHtml(senderNotice)}</p>` : ''}
    <p style="margin:0 0 4px;font-size:12px;color:${EMAIL_COLORS.muted}">${brandLine || `Windsor Beauty, ${brandDomain()}`}</p>
    ${footerText && footerText.trim() ? `<p style="margin:0;font-size:12px;color:${EMAIL_COLORS.muted}">${escapeHtml(footerText)}</p>` : ''}
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
      <table class="wb-card" role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="${EMAIL_COLORS.white}" style="background:${EMAIL_COLORS.white};max-width:600px;width:100%">
        ${emailHeaderHtml(params.headerLabel)}
        ${brandEmailBody(params.bodyHtml)}
        ${emailFooterHtml(params.footerText, params.footerBrandLine, params.senderNotice)}
      </table>
      ${params.afterTableHtml || ''}
    </td></tr>
  </table>
</body>
</html>`;
}

const legacyColours: Record<string, string> = {
  '#ffffff': EMAIL_COLORS.white, '#fff': EMAIL_COLORS.white,
  '#a9695d': EMAIL_COLORS.gold, '#a77b18': EMAIL_COLORS.gold, '#76520b': EMAIL_COLORS.gold,
  '#1c1917': EMAIL_COLORS.headingDark, '#3a2630': EMAIL_COLORS.gold,
  '#44403c': EMAIL_COLORS.bodyText, '#57534e': EMAIL_COLORS.bodyText,
  '#78716c': EMAIL_COLORS.muted, '#a8a29e': EMAIL_COLORS.muted, '#d4cfc9': EMAIL_COLORS.muted,
  '#e7e5e4': EMAIL_COLORS.border, '#e7dcc8': EMAIL_COLORS.cardBorder,
  '#f5f5f4': EMAIL_COLORS.pageBg, '#fafaf9': EMAIL_COLORS.white,
  '#fefce8': EMAIL_COLORS.cardBg, '#f8f5ef': EMAIL_COLORS.cardBg,
};

function brandEmailBody(html: string): string {
  return html.replace(/(style|bgcolor)="([^"]*)"/gi, (_match, attr: string, value: string) => {
    const branded = value.replace(/#[a-f0-9]{3,8}\b/gi, colour => legacyColours[colour.toLowerCase()] || colour).replace(/font-size:\s*(?:9|10|11)px/gi, 'font-size:12px');
    return attr + '="' + branded + '"';
  }).replace(/<td(?![^>]*class=)([^>]*style="[^"]*padding:[^";]*40px[^>]*>)/gi, '<td class="wb-body-pad"$1');
}
