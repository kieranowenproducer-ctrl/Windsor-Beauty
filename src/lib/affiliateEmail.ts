import { sendEmail, type SendEmailResult } from '@/lib/email/send';
import { emailGreeting } from '@/lib/email/greeting';
import { EMAIL_COLORS, emailDocument, escapeHtml } from '@/lib/email/shared';

const from = 'Windsor Beauty <sales@windsorbeauty.is>';
const invitationFrom = 'Windsor Beauty <info@windsorbeauty.is>';

export type AffiliateInvitationEmailParams = {
  email: string;
  affiliateName: string;
  link: string;
  expiresAt: string;
  /** True when the person asked for it on the partner's request page; false when the partner typed their address in. */
  requested: boolean;
};

/**
 * The one email a person invited by a partner receives. It is the whole guide: who it is from, the three
 * steps, what they get, and the button. Nothing else is needed to join.
 */
export function affiliateInvitationEmail(params: AffiliateInvitationEmailParams) {
  // With no partner name on record the email speaks for the shop itself.
  const name = params.affiliateName.trim() || 'Windsor Beauty';
  const hasPartner = Boolean(params.affiliateName.trim());
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(params.link);
  const safeEmail = escapeHtml(params.email);
  const until = new Date(params.expiresAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' });
  const opening = params.requested
    ? (hasPartner ? `You asked for a private invitation from ${name}. Here it is.` : 'You asked for a private invitation. Here it is.')
    : (hasPartner
      ? `${name} has invited you to join Windsor Beauty as a member, and asked us to send you this.`
      : 'You have been invited to join Windsor Beauty as a member.');
  const steps: Array<[string, string]> = [
    ['Press the button below', 'It opens your sign-up page with your invitation already filled in.'],
    ['Join with this email address', `Use ${params.email}. The invitation only works with this address.`],
    ['Confirm your email', 'We send you a short email. Press the link in it and your account is ready.'],
  ];
  const c = EMAIL_COLORS;
  const stepRows = steps.map(([title, detail], index) => `<tr>
      <td width="44" valign="top" style="padding:0 0 18px"><div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${c.gold};color:#ffffff;font-weight:bold;font-size:14px;text-align:center">${index + 1}</div></td>
      <td valign="top" style="padding:3px 0 18px"><p style="margin:0;color:${c.headingDark};font-size:15px;font-weight:bold">${escapeHtml(title)}</p><p style="margin:4px 0 0;color:${c.bodyText};font-size:14px;line-height:1.6">${index === 1 ? `Use <strong style="color:${c.headingDark}">${safeEmail}</strong>. The invitation only works with this address.` : escapeHtml(detail)}</p></td>
    </tr>`).join('');
  const button = (label: string) => `<table cellpadding="0" cellspacing="0" style="margin:6px 0 0"><tr><td bgcolor="${c.gold}" style="background:${c.gold}"><a href="${safeLink}" style="display:inline-block;padding:15px 26px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;

  const bodyHtml = `<tr><td style="padding:34px 32px 8px">
      <p style="margin:0;color:${c.gold};font-size:11px;letter-spacing:3px;text-transform:uppercase">${hasPartner ? `Courtesy of ${safeName}` : 'Your private invitation'}</p>
      <h1 style="margin:10px 0 0;color:${c.headingDark};font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:normal;line-height:1.25">Welcome to Windsor Beauty</h1>
      <p style="margin:14px 0 0;color:${c.bodyText};font-size:15px;line-height:1.7">${escapeHtml(opening)} Joining takes about two minutes.</p>
    </td></tr>
    <tr><td style="padding:22px 32px 6px"><table width="100%" cellpadding="0" cellspacing="0">${stepRows}</table></td></tr>
    <tr><td style="padding:0 32px 26px">${button(hasPartner ? `Accept ${name}’s invitation` : 'Accept your invitation')}</td></tr>
    <tr><td style="padding:0 32px 26px"><table width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.cardBg}" style="background:${c.cardBg};border:1px solid ${c.cardBorder}"><tr><td style="padding:18px 20px">
      <p style="margin:0;color:${c.headingDark};font-size:14px;font-weight:bold">What you get when you join</p>
      <p style="margin:8px 0 0;color:${c.bodyText};font-size:14px;line-height:1.6"><strong style="color:${c.headingDark}">10% off your first order.</strong> We email you the code as soon as you confirm your email.</p>
      <p style="margin:6px 0 0;color:${c.bodyText};font-size:14px;line-height:1.6"><strong style="color:${c.headingDark}">Your own 5% code</strong> for later orders with £30 or more of products. Delivery does not count towards the £30.</p>
      <p style="margin:6px 0 0;color:${c.bodyText};font-size:13px;line-height:1.6">One code per order.</p>
    </td></tr></table></td></tr>
    <tr><td style="padding:0 32px 30px;color:${c.bodyText};font-size:13px;line-height:1.7">
      <p style="margin:0">This invitation works once and lasts until ${escapeHtml(until)}. If the button does not work, copy this link into your browser:<br><a href="${safeLink}" style="color:${c.gold};word-break:break-all">${safeLink}</a></p>
      <p style="margin:12px 0 0">You have not been added to our marketing list. If you were not expecting this, you can ignore it, or reply to tell us and we will not send another.</p>
    </td></tr>`;

  const welcomeLine = hasPartner ? `Welcome to Windsor Beauty, courtesy of ${name}` : 'Welcome to Windsor Beauty';
  const text = `${welcomeLine}.

${opening} Joining takes about two minutes.

1. Open your invitation: ${params.link}
2. Join with this email address: ${params.email}. The invitation only works with this address.
3. Confirm your email. We send you a short email. Press the link in it and your account is ready.

What you get when you join:
- 10% off your first order. We email you the code as soon as you confirm your email.
- Your own 5% code for later orders with £30 or more of products. Delivery does not count towards the £30.
One code per order.

This invitation works once and lasts until ${until}.

You have not been added to our marketing list. If you were not expecting this, you can ignore it, or reply to tell us and we will not send another.

Windsor Beauty`;

  return {
    subject: !hasPartner ? 'Your private invitation to Windsor Beauty' : params.requested ? `Your private invitation from ${name}` : `${name} has invited you to Windsor Beauty`,
    text,
    html: emailDocument({
      title: welcomeLine,
      headerLabel: 'Your invitation',
      preheader: `${welcomeLine}. Join in three steps and get 10% off your first order.`,
      bodyHtml,
    }),
  };
}

const RETRY_DELAY_MS = 1500;

/**
 * Sends the invitation, and tries once more if the first attempt fails. The same idempotency key
 * goes with both attempts, so a first attempt that did reach the provider is never delivered twice.
 */
export async function sendAffiliateInvitationEmail(params: AffiliateInvitationEmailParams & { invitationId: number }): Promise<SendEmailResult & { attempts: number }> {
  const message = affiliateInvitationEmail(params);
  const payload = { from: invitationFrom, to: params.email, replyTo: 'info@windsorbeauty.is', ...message };
  const options = {
    filing: { emailType: params.requested ? 'affiliate_requested_invitation' : 'affiliate_invitation' },
    idempotencyKey: `affiliate-invitation-${params.invitationId}`,
  };
  const first = await sendEmail(payload, options);
  if (first.ok) return { ...first, attempts: 1 };
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
  const second = await sendEmail(payload, options);
  return { ...second, attempts: 2 };
}

export async function sendAffiliatePayoutRequestEmail(params: { affiliateName: string; email: string; amountPence: number; method: string }) {
  const amount = `£${(params.amountPence / 100).toFixed(2)}`;
  const staff = process.env.AFFILIATE_ADMIN_EMAIL || process.env.SENTINEL_ALERT_EMAIL || 'kieranowenproducer@gmail.com';
  const message = `${params.affiliateName} requested ${amount} as ${params.method === 'cash' ? 'cash' : 'shop credit'}. Staff must approve it in Affiliate control before the balance changes.`;
  const staffResult = await sendEmail({
    from,
    to: staff,
    subject: `Affiliate request from ${params.affiliateName}: ${amount}`,
    text: message,
  }, { internal: true });
  const affiliateResult = await sendEmail({
    from,
    to: params.email,
    subject: `We received your affiliate request for ${amount}`,
    text: `${emailGreeting(params.affiliateName)}\n\n${message}\n\nWe will update its status after staff review.\n\nWindsor Beauty`,
  }, { filing: { emailType: 'affiliate_payout_request' } });
  return { ok: staffResult.ok && affiliateResult.ok, staff: staffResult, affiliate: affiliateResult };
}

export async function sendAffiliateCodeExpiryEmail(params: { email: string; firstName: string; code: string; expiresAt: string }) {
  const date = new Date(params.expiresAt).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric' });
  return sendEmail({
    from,
    to: params.email,
    subject: 'Your Windsor Beauty discount code expires soon',
    text: `${emailGreeting(params.firstName)}\n\nYour personal 5% code ${params.code} expires on ${date}. It can be used on product orders of £30 or more. Delivery does not count towards the £30 minimum.\n\nWindsor Beauty`,
  }, { filing: { emailType: 'affiliate_code_expiry' } });
}
