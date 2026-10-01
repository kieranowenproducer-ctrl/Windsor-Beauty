import { emailDocument, escapeHtml } from './email/shared';
import { emailGreeting } from './email/greeting';

export function buildEnquiryAcknowledgementEmail(params: { name: string; subjectLabel: string; orderNumber?: string | null; message: string }) {
 const { name, subjectLabel, orderNumber, message } = params;
 return { subject: `We have received your enquiry: ${subjectLabel}`,
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
              ${orderNumber ? `<p style="margin:0 0 12px;font-size:13px;color:#57534e"><strong>Order number:</strong> <span style="font-family:monospace;color:#A9695D">${escapeHtml(orderNumber)}</span></p>` : ''}
              <p style="margin:16px 0 4px;font-size:13px;color:#57534e"><strong>Your message:</strong></p>
              <p style="margin:0 0 20px;white-space:pre-wrap;background:#f5f5f4;padding:12px 16px;font-size:13px;color:#57534e">${escapeHtml(message)}</p>
              <p style="margin:0;font-size:13px;color:#57534e">We aim to respond <strong>within one business day</strong>. You do not need to send it again.</p>
            </td>
          </tr>`,
        }) };
}

export function buildEnquiryReplyEmail(params: { subject: string; standardText: string; originalMessage: string; addAutomaticGreeting: boolean; automaticGreeting: string; message: string; quotedHtml: string }) {
 const { subject, standardText, originalMessage, addAutomaticGreeting, automaticGreeting, message, quotedHtml } = params;
 return { subject,
text: `${standardText}\n\n` +
          `Windsor Beauty\nwindsorbeauty.co.uk\n\n` +
          `--- Your original message ---\n${originalMessage}\n`,
html: emailDocument({
        title: subject,
        headerLabel: 'Windsor Beauty',
        // No footerText override: the shared footer already prints
        // "Windsor Beauty, windsorbeauty.co.uk", which is all this email needs.
        bodyHtml: `
        <tr>
          <td style="padding:40px 40px 32px">
            ${addAutomaticGreeting ? `<p style="margin:0 0 20px;font-size:13px;color:#57534e;font-family:Arial">${escapeHtml(automaticGreeting)}</p>` : ''}
            <p style="margin:0;white-space:pre-wrap;font-size:13px;color:#57534e;line-height:1.7;font-family:Arial">${escapeHtml(message)}</p>
            ${quotedHtml}
          </td>
        </tr>`,
      }) };
}

