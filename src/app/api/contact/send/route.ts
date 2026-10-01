import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { ensureSchema, findOrderByNumber, isDbConfigured, logAutomationFailure } from '@/lib/db';
import { createEnquiry } from '@/lib/db/enquiries';
import { clientIpOf, isFormRateLimited, logFormAttempt, RATE_LIMIT_MESSAGE } from '@/lib/db/formLimits';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { emailGreeting, emailGreetingName } from '@/lib/email/greeting';
import { enquiryAlertRecipients } from '@/lib/email/enquiryAlerts';

const FROM_ADDRESS = 'Windsor Beauty Website <enquiries@windsorbeauty.co.uk>';
const TO_ADDRESS = 'sales@windsorbeauty.co.uk';

const SUBJECT_LABELS: Record<string, string> = {
  general: 'General Enquiry',
  order:   'Order Enquiry',
  product: 'Product Information',
  verify:  'Verification Issue',
  returns: 'Returns and Refunds',
  other:   'Other',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORDER_PATTERN  = /^WB-[A-Z0-9]{4,}$/i;

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return value; }
}

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { status: 'error', message: 'The contact form is temporarily unavailable. Please email us directly instead.' },
      { status: 503 }
    );
  }

  // The most exposed of the three public forms: no login at all, and every
  // submission sends an email and opens an enquiry. Note the response shape
  // here is { status, message }, not { error } — this route has always spoken
  // that way to the contact page and the 429 must match it.
  const ip = clientIpOf(request);
  if (await isFormRateLimited('contact', ip)) {
    return NextResponse.json({ status: 'error', message: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  await logFormAttempt('contact', ip);

  const body = await request.json().catch(() => null);
  const name        = typeof body?.name        === 'string' ? body.name.trim()                    : '';
  const email       = typeof body?.email       === 'string' ? body.email.trim().toLowerCase()     : '';
  const subjectKey  = typeof body?.subject     === 'string' ? body.subject.trim()                 : '';
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : '';
  const message     = typeof body?.message     === 'string' ? body.message.trim()                 : '';

  if (!name || !email || !EMAIL_PATTERN.test(email) || !subjectKey || !message) {
    return NextResponse.json(
      { status: 'error', message: 'Please fill in every required field with a valid email address before sending.' },
      { status: 400 }
    );
  }
  if (name.length > 200 || message.length > 5000) {
    return NextResponse.json(
      { status: 'error', message: 'Your name or message is too long. Please shorten it and try again.' },
      { status: 400 }
    );
  }

  const subjectLabel = SUBJECT_LABELS[subjectKey] ?? subjectKey;

  // ── Order lookup ─────────────────────────────────────────────────────────────
  type OrderSummary = {
    orderNumber: string;
    customerName: string;
    email: string;
    items: Array<{ name: string; variant?: string; quantity: number; price: number }>;
    total: number;
    status: string;
    createdAt: string;
    adminUrl: string;
  };

  let orderSummary: OrderSummary | null = null;

  if (orderNumber && ORDER_PATTERN.test(orderNumber) && isDbConfigured()) {
    const order = await findOrderByNumber(orderNumber).catch(() => null);
    if (order) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';
      orderSummary = {
        orderNumber:  order.order_number,
        customerName: order.customer_name,
        email:        order.email,
        items:        order.items,
        total:        Number(order.total),
        status:       order.status,
        createdAt:    order.created_at,
        adminUrl:     `${siteUrl}/admin/orders`,
      };
    }
  }

  // ── Build email ───────────────────────────────────────────────────────────────
  const subjectLine = orderSummary
    ? `Website enquiry: ${subjectLabel}, ${orderSummary.orderNumber}, ${name}`
    : `Website enquiry: ${subjectLabel}, ${name}`;

  const orderBlockHtml = orderSummary ? `
    <div style="margin:20px 0;border:2px solid #b8902a;background:#fefce8;padding:16px 20px">
      <p style="margin:0 0 12px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;font-family:Arial">
        Order on File
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;color:#57534e;font-family:Arial">
        <tr>
          <td style="padding:3px 0;color:#a8a29e;width:130px">Order Number</td>
          <td style="padding:3px 0;font-family:monospace;font-weight:bold;color:#b8902a;letter-spacing:0.1em">${escapeHtml(orderSummary.orderNumber)}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#a8a29e">Customer</td>
          <td style="padding:3px 0">${escapeHtml(orderSummary.customerName)}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#a8a29e">Order Email</td>
          <td style="padding:3px 0">${escapeHtml(orderSummary.email)}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#a8a29e">Placed</td>
          <td style="padding:3px 0">${formatDate(orderSummary.createdAt)}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#a8a29e">Status</td>
          <td style="padding:3px 0;text-transform:capitalize">${escapeHtml(orderSummary.status.replace(/_/g, ' '))}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#a8a29e">Items</td>
          <td style="padding:3px 0">${orderSummary.items.map(i =>
            `${i.quantity}&times; ${escapeHtml(i.name)}${i.variant ? ` (${escapeHtml(i.variant)})` : ''}`
          ).join('<br>')}</td>
        </tr>
        <tr>
          <td style="padding:6px 0 3px;color:#a8a29e;border-top:1px solid #e7dcc8">Total</td>
          <td style="padding:6px 0 3px;font-weight:bold;color:#1c1917;border-top:1px solid #e7dcc8">&pound;${orderSummary.total.toFixed(2)}</td>
        </tr>
      </table>
      <a href="${escapeHtml(orderSummary.adminUrl)}"
         style="display:inline-block;margin-top:14px;background:#1a1a1a;color:#ffffff;font-size:10px;
                letter-spacing:0.15em;text-transform:uppercase;padding:8px 18px;text-decoration:none;font-family:Arial">
        View in Admin Panel &rarr;
      </a>
    </div>
  ` : orderNumber ? `
    <div style="margin:20px 0;border:1px solid #fca5a5;background:#fef2f2;padding:12px 16px;font-size:12px;color:#7f1d1d;font-family:Arial">
      Order number <strong>${escapeHtml(orderNumber)}</strong> was not found in the system. The customer may have entered it incorrectly.
    </div>
  ` : '';

  const orderBlockText = orderSummary ? `
--- ORDER ON FILE ---
Order Number: ${orderSummary.orderNumber}
Customer:     ${orderSummary.customerName}
Order Email:  ${orderSummary.email}
Placed:       ${formatDate(orderSummary.createdAt)}
Status:       ${orderSummary.status.replace(/_/g, ' ')}
Items:        ${orderSummary.items.map(i => `${i.quantity}x ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ')}
Total:        £${orderSummary.total.toFixed(2)}
Admin:        ${orderSummary.adminUrl}
---------------------
` : orderNumber ? `\nNote: Order number ${orderNumber} was not found in the system.\n` : '';

  // Store the enquiry so it can be read and answered from /admin/enquiries.
  // Best-effort on purpose: the customer's message must still reach the sales
  // inbox even if the database is unreachable, so a failure here is swallowed.
  if (isDbConfigured()) {
    try {
      await createEnquiry({
        name, email, subjectKey, subjectLabel,
        orderNumber: orderNumber || null,
        message,
      });
    } catch {
      try {
        // Almost always a first run before the table exists.
        await ensureSchema();
        await createEnquiry({
          name, email, subjectKey, subjectLabel,
          orderNumber: orderNumber || null,
          message,
        });
      } catch (err) {
        console.error('[contact/send] could not store the enquiry:', err);
        await logAutomationFailure('admin_email', 'A contact-form enquiry could not be put on the dashboard', {
          orderNumber: orderNumber || null, detail: err,
        }).catch(() => {});
      }
    }
  }

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      to:   enquiryAlertRecipients(),
      replyTo: email,
      subject: subjectLine,
      text:
        `New enquiry from the Windsor Beauty contact form.\n\n` +
        `Name:    ${name}\n` +
        `Email:   ${email}\n` +
        `Subject: ${subjectLabel}\n` +
        (orderNumber ? `Order #: ${orderNumber}\n` : '') +
        orderBlockText +
        `\nMessage:\n${message}`,
      html: emailDocument({
        title: subjectLine,
        headerLabel: 'Website Enquiry',
        footerText: 'Internal notification. Reply directly to this email to respond to the customer.',
        bodyHtml: `
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 4px;font-size:13px;color:#57534e"><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p style="margin:0 0 4px;font-size:13px;color:#57534e"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#b8902a">${escapeHtml(email)}</a></p>
            <p style="margin:0 0 4px;font-size:13px;color:#57534e"><strong>Subject:</strong> ${escapeHtml(subjectLabel)}</p>
            ${orderNumber ? `<p style="margin:0 0 16px;font-size:13px;color:#57534e"><strong>Order Number (submitted):</strong> <span style="font-family:monospace;color:#b8902a">${escapeHtml(orderNumber)}</span></p>` : '<br>'}

            ${orderBlockHtml}

            <p style="margin:16px 0 4px;font-size:13px;color:#57534e"><strong>Message:</strong></p>
            <p style="margin:0;white-space:pre-wrap;background:#f5f5f4;padding:12px 16px;font-size:13px;color:#57534e">${escapeHtml(message)}</p>
          </td>
        </tr>`,
      }),
    });

    // ── The customer's own acknowledgement (task 0c1101e1) ──────────────────
    //
    // Until 7 September a website enquiry sent exactly ONE email, to sales@.
    // The person who wrote in got nothing back: no thank you, no reference, no
    // sign it had arrived. Kieran, on being told: "that is totally wrong...
    // every enquiry that somebody writes to us about needs to be acknowledged."
    //
    // THE ONE BUSINESS DAY PROMISE IS NOT INVENTED HERE. It is what the live
    // contact page already tells people ("We aim to respond within one business
    // day", from the site_content 'contact' override), so the email mirrors the
    // page rather than making a second, different promise. If that page is
    // reworded, reword this with it.
    //
    // It deliberately does NOT answer anything. An acknowledgement that starts
    // being helpful about a product is an answer nobody reviewed.
    //
    // Sent AFTER the internal email and never allowed to fail the request: the
    // enquiry is already saved and sales@ already has it. A customer getting no
    // acknowledgement is the fault being fixed; a customer being told their
    // message failed when it did not would be a worse one.
    try {
      await sendEmail({
        from: FROM_ADDRESS,
        to: email,
        replyTo: TO_ADDRESS,
        subject: `We have received your enquiry: ${subjectLabel}`,
        text:
          `${emailGreeting(name)}

` +
          `Thank you for getting in touch with Windsor Beauty. This is just to confirm we have received your message.

` +
          `You asked about: ${subjectLabel}
` +
          (orderNumber ? `Order number: ${orderNumber}
` : '') +
          `
Your message:
${message}

` +
          `We aim to respond within one business day. You do not need to send it again.

` +
          `Windsor Beauty
windsorbeauty.co.uk`,
        html: emailDocument({
          title: 'We have received your enquiry',
          headerLabel: 'Enquiry Received',
          bodyHtml: `
          <tr>
            <td style="padding:40px 40px 32px">
              <p style="margin:0 0 16px;font-size:14px;color:#44403c">${escapeHtml(emailGreeting(name))}</p>
              <p style="margin:0 0 16px;font-size:13px;color:#57534e">Thank you for getting in touch with Windsor Beauty. This is just to confirm we have received your message.</p>
              <p style="margin:0 0 4px;font-size:13px;color:#57534e"><strong>You asked about:</strong> ${escapeHtml(subjectLabel)}</p>
              ${orderNumber ? `<p style="margin:0 0 12px;font-size:13px;color:#57534e"><strong>Order number:</strong> <span style="font-family:monospace;color:#b8902a">${escapeHtml(orderNumber)}</span></p>` : ''}
              <p style="margin:16px 0 4px;font-size:13px;color:#57534e"><strong>Your message:</strong></p>
              <p style="margin:0 0 20px;white-space:pre-wrap;background:#f5f5f4;padding:12px 16px;font-size:13px;color:#57534e">${escapeHtml(message)}</p>
              <p style="margin:0;font-size:13px;color:#57534e">We aim to respond <strong>within one business day</strong>. You do not need to send it again.</p>
            </td>
          </tr>`,
        }),
      });
    } catch (ackErr) {
      // Logged, never surfaced. The enquiry is safe either way.
      console.error('[contact/send] acknowledgement to the customer failed:', ackErr);
    }

    if (error) {
      console.error('Resend error:', error);
      await logAutomationFailure('admin_email', 'A contact-form enquiry was submitted, but the sales notification failed', {
        orderNumber: orderNumber || null, detail: error,
      }).catch(() => {});
      return NextResponse.json(
        { status: 'error', message: 'We could not send your message just now. Please try again shortly or email us directly.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: 'sent',
      message: 'Your message has been sent. Our team will get back to you as soon as possible.',
    });
  } catch (err) {
    console.error('Resend send threw:', err);
    return NextResponse.json(
      { status: 'error', message: 'We could not send your message just now. Please try again shortly or email us directly.' },
      { status: 500 }
    );
  }
}
