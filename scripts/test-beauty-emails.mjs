import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { EMAIL_PREVIEW_TYPES, buildEmailPreview } from '../src/lib/email/previews.ts';
import { EMAIL_COLORS } from '../src/lib/email/shared.ts';
const output = process.argv.includes('--render') ? '.email-previews' : null;
if (output) mkdirSync(output, { recursive: true });
for (const type of EMAIL_PREVIEW_TYPES) {
  const email = buildEmailPreview(type);
  assert.ok(email.subject && email.text && email.html, `${type}: complete message`);
  assert.ok(email.html.includes('/images/email/email-logo-20261001.png'), `${type}: approved logo`);
  assert.ok(email.html.includes(EMAIL_COLORS.gold), `${type}: plum`);
  assert.ok(email.html.includes(EMAIL_COLORS.pageBg), `${type}: cream`);
  assert.doesNotMatch(email.subject + email.text + email.html, /Windsor Glow|windsorglow\.com|peptide|research|header-glow|hexagon|—|&mdash;/i, `${type}: old brand or unsuitable wording`);
  assert.doesNotMatch(email.html, /(?:color|background|bgcolor)[:=]"?\s*#(?:ffffff|fff|a9695d|a8a29e|57534e|16140f)\b/i, `${type}: legacy palette`);
  if (output) writeFileSync(`${output}/${type}.html`, email.html);
  console.log(`PASS ${type}`);
}
const escaped = (await import('../src/lib/passwordResetEmail.ts')).buildPasswordResetEmail({ to:'sample@example.invalid', customerName:'<script>alert(1)</script>', resetUrl:'https://example.invalid/?a=1&b="x"' });
assert.doesNotMatch(escaped.html, /<script>/);
console.log(`${EMAIL_PREVIEW_TYPES.length} email previews passed. No email was sent.`);

const { affiliateInvitationEmail } = await import('../src/lib/affiliateEmail.ts');
const { buildAutomationAlertEmail } = await import('../src/lib/automationAlertEmail.ts');
const { renderCustomerMessageHtml } = await import('../src/lib/customerMessageEmail.ts');
const { resolveAdminSender } = await import('../src/lib/email/adminSenders.ts');
for (const html of [affiliateInvitationEmail({email:'sample@example.invalid',affiliateName:'Sample Partner',link:'https://example.invalid/',expiresAt:'2026-10-10T12:00:00Z',requested:true}).html, buildAutomationAlertEmail({category:'customer_email',message:'Sample failed email'}).html, renderCustomerMessageHtml({subject:'Sample message',message:'Thank you for your message.',sender:resolveAdminSender('sales')})]) {
 assert.ok(html.includes(EMAIL_COLORS.gold));
 assert.ok(html.includes('/images/email/email-logo-20261001.png'));
 assert.doesNotMatch(html,/Windsor Glow|windsorglow|header-glow|hexagon|—/i);
}
function luminance(hex) { const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return v[0]*0.2126+v[1]*0.7152+v[2]*0.0722; }
for (const foreground of [EMAIL_COLORS.gold,EMAIL_COLORS.headingDark,EMAIL_COLORS.bodyText,EMAIL_COLORS.muted]) for(const background of [EMAIL_COLORS.white,EMAIL_COLORS.pageBg,EMAIL_COLORS.cardBg]) { const a=luminance(foreground),b=luminance(background);assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5,'Text contrast passes AA'); }
console.log('Additional staff, customer and dormant partner templates passed. All shared text colours pass AA on cream and blush.');

