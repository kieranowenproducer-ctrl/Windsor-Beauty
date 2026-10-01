import { buildOrderConfirmationEmail } from '../orderConfirmationEmail';
import { buildShippingConfirmationEmail } from '../shippingEmail';
import { buildInvoiceEmail } from '../invoiceEmail';
import { buildPaymentLinkEmail } from '../paymentLinkEmail';
import { buildPaymentResumeEmail } from '../paymentResumeEmail';
import { buildPasswordResetEmail } from '../passwordResetEmail';
import { buildVerifyEmail } from '../verifyEmailEmail';
import { buildMembershipWelcomeEmail } from '../membershipWelcomeEmail';
import { buildBackInStockEmail } from '../backInStockEmail';
import { buildReviewNotificationEmail } from '../reviewNotificationEmail';
import { buildAdminOrderNotificationEmail } from '../adminOrderNotificationEmail';
import { buildLowStockAlertEmail } from '../lowStockAlertEmail';
import { buildEnquiryAcknowledgementEmail, buildEnquiryReplyEmail } from '../enquiryEmails';

export const EMAIL_PREVIEW_TYPES = ['paid', 'dispatched', 'invoice', 'payment-link', 'payment-resume', 'password-reset', 'verify-email', 'verify-reminder', 'welcome', 'back-in-stock', 'review', 'staff-order', 'low-stock', 'enquiry-reply', 'enquiry-acknowledgement'] as const;
export type EmailPreviewType = typeof EMAIL_PREVIEW_TYPES[number];
// These details only render examples. This module never sends email or reads customer data.
export function buildEmailPreview(type: EmailPreviewType): { subject: string; text: string; html: string } {
  const to = 'sample@example.invalid';
  const base = { to, customerName: 'Sample Customer', orderNumber: 'WB-SAMPLE' };
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';
  const order = { ...base, items: [{ name: 'Sample Serum', variant: '30ml', quantity: 2, price: 30, slug: 'sample-serum' }], subtotal: 60, shippingLabel: 'Sample delivery', shippingCost: 10, total: 70, shippingAddress: 'Sample Customer\nExample address\nSample town' };
  switch (type) {
    case 'paid': return buildOrderConfirmationEmail(order);
    case 'dispatched': return buildShippingConfirmationEmail({ ...base, trackingNumber: 'SAMPLE', carrierName: 'Royal Mail' });
    case 'invoice': return buildInvoiceEmail({ ...base, invoiceNumber: 'WB-INV-SAMPLE', lineItems: [{ type: 'product', discount: 0, name: 'Sample Serum', quantity: 2, unitPrice: 30, lineTotal: 60 }], subtotal: 60, shippingAmount: 10, discountAmount: 0, total: 70, fenaPaymentUrl: null, payUrl: `${site}/pay/sample` });
    case 'payment-link': return buildPaymentLinkEmail({ ...base, total: 70, paymentUrl: `${site}/payment/resume?token=sample` });
    case 'payment-resume': return buildPaymentResumeEmail({ ...base, total: 70, resumeUrl: `${site}/payment/resume?token=sample` });
    case 'password-reset': return buildPasswordResetEmail({ ...base, resetUrl: `${site}/account/reset-password?token=sample` });
    case 'verify-email': case 'verify-reminder': return buildVerifyEmail({ ...base, verifyUrl: `${site}/account/verify-email?token=sample`, variant: type === 'verify-reminder' ? 'reminder' : 'initial' });
    case 'welcome': return buildMembershipWelcomeEmail({ ...base, discountCode: 'SAMPLE-ONLY' });
    case 'back-in-stock': return buildBackInStockEmail({ to, productName: 'Sample Serum', productUrl: `${site}/shop/sample-serum` });
    case 'review': return buildReviewNotificationEmail({ reviewId: 0, customerName: base.customerName, customerEmail: to, rating: 5, title: 'Sample review', body: 'This is example review text for checking the email.', productName: 'Sample Serum', createdAt: '2026-10-01T12:00:00Z' });
    case 'staff-order': return buildAdminOrderNotificationEmail({ ...order, email: to, phone: null, paymentMethod: 'paypal', paymentStatus: 'awaiting_verification', createdAt: '2026-10-01T12:00:00Z' });
    case 'low-stock': return buildLowStockAlertEmail([{ slug: 'sample-serum', name: 'Sample Serum', dosage: '30ml', quantity: 2 }], 5);
    case 'enquiry-acknowledgement': return buildEnquiryAcknowledgementEmail({ name: base.customerName, subjectLabel: 'Sample delivery question', orderNumber: base.orderNumber, message: 'This is a sample enquiry for checking the email.' });
    case 'enquiry-reply': return buildEnquiryReplyEmail({ subject: 'Re: Sample delivery question', standardText: 'Hi Sample,\n\nThank you for your message. We will check your order.', originalMessage: 'This is a sample enquiry.', addAutomaticGreeting: true, automaticGreeting: 'Hi Sample,', message: 'Thank you for your message. We will check your order.', quotedHtml: '<p>Your message</p><p>This is a sample enquiry.</p>' });
  }
}

