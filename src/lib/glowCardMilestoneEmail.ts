import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { sendEmail } from '@/lib/email/send';
import { SUPPORT_REPLY_TO } from '@/lib/email/supportAddress';
import { buildGlowCardEmailVisual } from '@/lib/orderConfirmationEmail';

const FROM_ADDRESS = 'Windsor Beauty <orders@windsorbeauty.co.uk>';

export async function sendGlowCardMilestoneEmail(params: {
  to: string; customerName: string; milestone: 5 | 10 | 15; amount: number;
}) {
  if (!process.env.RESEND_API_KEY) return false;
  const next = params.milestone === 5 ? 'Keep collecting towards £20 off at 10 points.'
    : params.milestone === 10 ? 'Keep collecting towards £30 off at 15 points.'
      : 'Claim this £30 reward to start a fresh Beauty Card at zero.';
  const subject = `Your £${params.amount} Beauty Card reward is ready`;
  const html = emailDocument({
    title: subject,
    headerLabel: 'Beauty Card reward',
    bodyHtml: `<tr><td style="padding:40px">
      <p style="margin:0 0 8px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#a77b18">${params.milestone} Beauty Points</p>
      <h1 style="margin:0 0 16px;font-size:28px;font-weight:normal;color:#1c1917">Your £${params.amount} reward is ready.</h1>
      <p style="margin:0 0 18px;font-size:13px;font-weight:bold;color:#76520b;line-height:1.6">It also includes half-price standard UK delivery.</p>
      <p style="margin:0 0 18px;font-size:13px;color:#57534e;line-height:1.6">Congratulations ${escapeHtml(params.customerName.split(' ')[0])}, you reached ${params.milestone} points on your Beauty Card.</p>
      <div style="margin:0 0 18px">${buildGlowCardEmailVisual(params.milestone)}</div>
      <p style="margin:0 0 18px;font-size:13px;color:#57534e;line-height:1.6">${next}</p>
      <p style="margin:0"><a href="https://www.windsorbeauty.co.uk/account/glow-card" style="display:inline-block;background:#AD8E54;color:#fff;padding:12px 18px;text-decoration:none;font-size:12px">View your Beauty Card</a></p>
    </td></tr>`,
  });
  const text = `Congratulations ${params.customerName.split(' ')[0]}, you reached ${params.milestone} Beauty Points. Your £${params.amount} reward is ready and includes half-price standard UK delivery. ${next}\n\nView your Beauty Card: https://www.windsorbeauty.co.uk/account/glow-card`;
  const { error } = await sendEmail({ from: FROM_ADDRESS, replyTo: SUPPORT_REPLY_TO, to: params.to, subject, text, html });
  return !error;
}
