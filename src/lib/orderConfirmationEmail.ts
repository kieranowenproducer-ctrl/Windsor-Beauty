import type { OrderItemRecord } from '@/lib/db';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';
import { displayOrderItems } from '@/lib/orderTrialDisplay';

const FROM_ADDRESS = 'Windsor Beauty <orders@windsorbeauty.co.uk>';

export interface OrderConfirmationParams {
  to: string;
  customerName: string;
  orderNumber: string;
  items: OrderItemRecord[];
  subtotal: number;
  discountCode?: string | null;
  discountAmount?: number;
  // Automatic promotion / site-sale money off (orders.rule_discount_amount) —
  // shown as its own line so the visible sums always reconcile to the total.
  ruleDiscountAmount?: number;
  shippingLabel: string;
  shippingCost: number;
  paypalFee?: number;
  total: number;
  shippingAddress: string;
  glowCard?: {
    earnedPoint: boolean;
    reason: 'earned' | 'below_minimum' | 'not_signed_in' | 'not_eligible' | 'already_processed';
    points: number | null;
    cycle: number | null;
    nextMilestone: number | null;
    nextRewardAmount: number | null;
    pointsAway: number;
  } | null;
}

function normaliseGlowPoints(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(15, Math.floor(value))) : 0;
}

function glowCardCopy(card: OrderConfirmationParams['glowCard']) {
  if (!card) return null;
  if (card.points === null || card.cycle === null) {
    return {
      headline: 'Collect Beauty Points when signed in',
      explanation: 'This order was not placed through a signed-in member account, so it did not add a point.',
      progress: 'Sign in before your next paid £30+ product order to start collecting Beauty Points.',
    };
  }
  const points = normaliseGlowPoints(card.points);
  const stage = glowCardEmailStage(points);
  const completedMilestone = points > 0 && points % 5 === 0;
  const progress = completedMilestone
    ? `All 5 stamps are filled. Your £${stage.amount} reward and half-price standard UK delivery are ready to claim.`
    : `You have ${stage.filled} of 5 stamps on your £${stage.amount} reward card. You are ${5 - stage.filled} point${5 - stage.filled === 1 ? '' : 's'} away from £${stage.amount} off plus half-price standard UK delivery.`;
  const headline = card.earnedPoint
    ? 'You earned another Beauty Point'
    : card.reason === 'below_minimum'
      ? 'Your Beauty Card progress'
      : card.reason === 'not_signed_in'
        ? 'Collect Beauty Points when signed in'
        : 'Your Beauty Card progress';
  const explanation = card.earnedPoint
    ? 'This paid member order was £30 or more in products, so your point has been added.'
    : card.reason === 'below_minimum'
      ? 'This order was below £30 of products, so it did not add a point. Your current card is still shown below.'
      : card.reason === 'not_signed_in'
        ? 'This order was not placed while signed in, so it did not add a point. Sign in before your next order to collect points.'
        : 'Your current Beauty Card is shown below.';
  return { headline, explanation, progress };
}

/**
 * A deliberately self-contained Beauty Card visual for email. It is built from
 * nested presentation tables rather than a personalised image URL: Outlook,
 * Gmail and Apple Mail can all render it, and the email never leaks a member
 * name, address, account ID or signed URL to an image service.
 */
function glowCardEmailStage(points: number) {
  // A milestone remains the completed card in the email that earned it:
  // point 5 shows five stamps on the £10 card; point 6 starts the £20 card.
  const stage = points <= 5
    ? { number: 1, start: 0, milestone: 5, amount: 10, background: '#fffaf0', border: '#dfd3ad' }
    : points <= 10
      ? { number: 2, start: 5, milestone: 10, amount: 20, background: '#f8efda', border: '#d8c483' }
      : { number: 3, start: 10, milestone: 15, amount: 30, background: '#f1dfaa', border: '#cfb45f' };
  return { ...stage, filled: Math.max(0, Math.min(5, points - stage.start)) };
}

export function buildGlowCardEmailVisual(pointsValue: number): string {
  const points = normaliseGlowPoints(pointsValue);
  const stage = glowCardEmailStage(points);
  const remaining = 5 - stage.filled;
  const watermarkWash = stage.number === 3 ? 'rgba(241,223,170,.93)' : stage.number === 2 ? 'rgba(248,239,218,.93)' : 'rgba(255,250,240,.93)';
  const status = remaining === 0
    ? `All 5 stamps are filled. Your £${stage.amount} reward is ready.`
    : `${remaining} more point${remaining === 1 ? '' : 's'} until £${stage.amount} off and half-price standard UK delivery.`;
  const watermarkUrl = 'https://www.windsorbeauty.co.uk/images/windsor-beauty-mark.png';
  const stamps = Array.from({ length: 5 }, (_, index) => {
    const filled = index < stage.filled;
    return `<td width="20%" align="center" style="padding:0 3px">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td width="38" height="38" align="center" valign="middle" bgcolor="${filled ? '#9b7417' : '#fffdf7'}" style="width:38px;height:38px;border-radius:50%;border:1px solid #b89234;background:${filled ? 'linear-gradient(145deg,#b58b27,#87630f)' : 'rgba(255,255,255,.72)'};color:${filled ? '#ffffff' : '#76520b'};font-size:13px;font-weight:bold;line-height:38px">${stage.start + index + 1}</td></tr></table>
    </td>`;
  }).join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${stage.background}" style="width:100%;background-color:${stage.background};background-image:linear-gradient(${watermarkWash},${watermarkWash}),url('${watermarkUrl}');background-size:100% 100%,62% auto;background-position:center,center;background-repeat:no-repeat,no-repeat;border:1px solid ${stage.border};box-shadow:0 8px 22px rgba(111,88,35,.07)">
      <tr><td style="padding:22px 20px 20px">
        <p style="margin:0;font-size:9px;font-weight:bold;letter-spacing:.22em;text-transform:uppercase;color:#8a6513">STAGE ${stage.number} &middot; ${stage.milestone} POINTS</p>
        <p style="margin:15px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.05;color:#1c1917">&pound;${stage.amount} off</p>
        <p style="margin:5px 0 18px;font-size:12px;font-weight:bold;color:#76520b">Plus half-price standard UK delivery</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${stamps}</tr></table>
        <p style="margin:16px 0 0;text-align:center;font-size:12px;font-weight:bold;color:#76520b">${stage.filled} of 5 stamps on this reward card</p>
        <p style="margin:5px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#57534e">${status}</p>
      </td></tr>
    </table>`;
}

function glowCardVisual(card: OrderConfirmationParams['glowCard']) {
  if (!card || card.points === null || card.cycle === null) return '';
  return buildGlowCardEmailVisual(card.points);
}

// Pure message builder — exported so the rendered output can be inspected and
// tested without sending anything.
export function buildOrderConfirmationEmail(params: OrderConfirmationParams): { subject: string; text: string; html: string } {
  const visibleItems = displayOrderItems(params.items);
  const itemRows = visibleItems.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;font-size:13px;color:#57534e">
        ${escapeHtml(i.name)}${i.variant ? ` <span style="color:#a8a29e">(${escapeHtml(i.variant)})</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:center;font-size:13px;color:#57534e">
        ${i.quantity}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right;font-size:13px;color:#57534e">
        &pound;${(Number(i.price) * i.quantity).toFixed(2)}
      </td>
    </tr>
  `).join('');

  // A discount with no code (invoice manual discount, first-order 10%) must
  // still appear in writing — condition on the amount alone.
  const discountRow = Number(params.discountAmount) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Discount${params.discountCode ? ` (${escapeHtml(params.discountCode)})` : ''}</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#b8902a">&minus;&pound;${Number(params.discountAmount).toFixed(2)}</td>
    </tr>
  ` : '';

  const ruleDiscountRow = Number(params.ruleDiscountAmount) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Promotional discount</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#b8902a">&minus;&pound;${Number(params.ruleDiscountAmount).toFixed(2)}</td>
    </tr>
  ` : '';

  const paypalFeeRow = Number(params.paypalFee) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">PayPal processing fee (3.5%)</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">&pound;${Number(params.paypalFee).toFixed(2)}</td>
    </tr>
  ` : '';
  const glowCard = glowCardCopy(params.glowCard);
  const glowCardImage = glowCardVisual(params.glowCard);
  const glowCardPanel = glowCard ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf8;border:1px solid #e3d5ad;margin-bottom:32px">
              <tr><td style="padding:20px 24px">
                <p style="margin:0 0 8px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a77b18">Your Beauty Card</p>
                <p style="margin:0 0 7px;font-size:19px;color:#1c1917">${escapeHtml(glowCard.headline)}</p>
                <p style="margin:0 0 18px;font-size:12px;color:#57534e;line-height:1.6">${escapeHtml(glowCard.explanation)}</p>
                ${glowCardImage}
                ${glowCardImage ? '' : `<p style="margin:16px 0 0;font-size:12px;font-weight:bold;color:#76520b;line-height:1.6">${escapeHtml(glowCard.progress)}</p>`}
              </td></tr>
            </table>` : '';

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#b8902a">Order Received</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">Thank you, ${escapeHtml(params.customerName.split(' ')[0])}.</h1>
            <p style="margin:0 0 24px;font-size:13px;color:#57534e;line-height:1.6">
              Your order has been confirmed and payment received. We are now preparing it for dispatch.
            </p>

            <!-- Order number badge -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px">
              <tr>
                <td style="border:1px solid #e7dcc8;background:#fefce8;padding:10px 20px">
                  <p style="margin:0;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;margin-bottom:2px">Order Reference</p>
                  <p style="margin:0;font-size:14px;font-family:monospace;font-weight:bold;color:#b8902a;letter-spacing:0.1em">${escapeHtml(params.orderNumber)}</p>
                </td>
              </tr>
            </table>

            <!-- Items -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Order Items</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <thead>
                <tr>
                  <th style="text-align:left;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Product</th>
                  <th style="text-align:center;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Qty</th>
                  <th style="text-align:right;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>

            <!-- Totals -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
              <tr>
                <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Subtotal</td>
                <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">&pound;${Number(params.subtotal).toFixed(2)}</td>
              </tr>
              ${ruleDiscountRow}
              ${discountRow}
              <tr>
                <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Shipping (${escapeHtml(params.shippingLabel)})</td>
                <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">${Number(params.shippingCost) === 0 ? 'Free' : `&pound;${Number(params.shippingCost).toFixed(2)}`}</td>
              </tr>
              ${paypalFeeRow}
              <tr>
                <td colspan="2" style="padding:10px 0 6px;font-size:14px;font-weight:bold;color:#1c1917;border-top:2px solid #1a1a1a">Total Paid</td>
                <td style="padding:10px 0 6px;text-align:right;font-size:14px;font-weight:bold;color:#b8902a;border-top:2px solid #1a1a1a">&pound;${Number(params.total).toFixed(2)}</td>
              </tr>
            </table>

            ${glowCardPanel}

            <!-- Delivery address -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Delivery Address</p>
            <p style="margin:0 0 32px;font-size:13px;color:#57534e;line-height:1.7;white-space:pre-line">${escapeHtml(params.shippingAddress)}</p>

            <!-- What's next -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #e7dcc8;margin-bottom:32px">
              <tr>
                <td style="padding:20px 24px">
                  <p style="margin:0 0 12px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e">What Happens Next</p>
                  <p style="margin:0 0 6px;font-size:12px;color:#57534e;line-height:1.6">1. Your order is being prepared for dispatch.</p>
                  <p style="margin:0 0 6px;font-size:12px;color:#57534e;line-height:1.6">2. Once dispatched via Royal Mail, you will receive a tracking number by email.</p>
                  <p style="margin:0;font-size:12px;color:#57534e;line-height:1.6">3. Your order will arrive within the selected delivery timeframe.</p>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;color:#a8a29e;line-height:1.6">
              Any questions, just reply to this email, or contact
              <a href="mailto:sales@windsorbeauty.co.uk" style="color:#b8902a;text-decoration:none">sales@windsorbeauty.co.uk</a>
              and include your order reference <strong style="color:#78716c">${escapeHtml(params.orderNumber)}</strong>.
            </p>
          </td>
        </tr>`;

  const html = emailDocument({
    title: `Order ${params.orderNumber} confirmed`,
    headerLabel: 'Order Confirmation',
    bodyHtml,
  });

  const subject = `Your Windsor Beauty order ${params.orderNumber} is confirmed`;
  const text =
    `${emailGreeting(params.customerName)}\n\n` +
    `Your Windsor Beauty order ${params.orderNumber} has been confirmed and payment received.\n\n` +
    `Items:\n` +
    visibleItems.map(i => `  ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}, £${(Number(i.price) * i.quantity).toFixed(2)}`).join('\n') +
    `\n\nTotal paid: £${Number(params.total).toFixed(2)}\n\n` +
    (glowCard ? `Beauty Card\n${glowCard.headline}. ${glowCard.explanation}\n${glowCard.progress}\n\n` : '') +
    `Delivery to: ${params.shippingAddress}\n\n` +
    `We will send you a tracking number once your order has been dispatched.\n\n` +
    `Any questions, just reply to this email, or contact sales@windsorbeauty.co.uk and include your order reference ${params.orderNumber}.`;

  return { subject, text, html };
}

export async function sendOrderConfirmationEmail(params: OrderConfirmationParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const { subject, text, html } = buildOrderConfirmationEmail(params);

  try {
    const { id, error } = await sendEmail({
      from: FROM_ADDRESS,
      // Replies reach a person. A customer answering an order or payment email was
      // writing into a void, and a From address that refuses replies is a pattern spam
      // filters associate with phishing (invoice junk-folder diagnosis, 31 July 2026).
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject,
      text,
      html,
    }, {
      // Filed under the customer automatically (task ce308493). This says which order it is
      // about and what kind of email it is, so the history reads as English and the orders
      // screen can find the very email it sent.
      filing: { orderRef: params.orderNumber, emailType: 'order_confirmation' },
    });

    if (error) {
      console.error('[orderConfirmationEmail] Resend error:', error);
      return false;
    }
    if (id) {
    }
    return true;
  } catch (err) {
    console.error('[orderConfirmationEmail] send threw:', err);
    return false;
  }
}
