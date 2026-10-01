import { NextResponse } from 'next/server';
import {
  findVerificationCode,
  findOrderByNumber,
  findCustomerByEmail,
  isDbConfigured,
  isRateLimited,
  logVerificationAttempt,
  logVerificationAuditEntry,
  markVerificationCodeUsed,
  type VerificationAuditStatus,
} from '@/lib/db';
import { recordIpActivity } from '@/lib/db/ipActivity';

// Order numbers are WG- followed by exactly 6 chars from the no-ambiguity
// alphabet used by generateOrderNumber() in src/lib/auth.ts.
const ORDER_NUMBER_RE = /^WG-[A-HJ-NP-Z2-9]{6}$/i;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { status: 'error', message: 'Verification is temporarily unavailable. Please try again shortly or contact support.' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || null;

  /* Recorded on the where-people-come-from log, which keeps the location as well
     as the address. Not awaited and it never throws, so checking a batch code
     cannot be slowed down or broken by an audit trail. */
  void recordIpActivity({ event: 'verification', request, detail: 'Batch code check' });

  // ── Step 1: all three fields are required ──────────────────────────────────
  if (!code) {
    return NextResponse.json({ status: 'error', message: 'Please enter your verification code.' }, { status: 400 });
  }
  if (!orderNumber) {
    return NextResponse.json({ status: 'error', message: 'Please enter your order number.' }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ status: 'error', message: 'Please enter your email address.' }, { status: 400 });
  }

  // ── Step 2: validate order number format ───────────────────────────────────
  if (!ORDER_NUMBER_RE.test(orderNumber)) {
    await logAudit({ code, orderNumber, email, status: 'failed_format', failureReason: 'Invalid order number format', ip, userAgent });
    return NextResponse.json({
      status: 'order_not_found',
      message: 'That order number does not look right. Windsor Glow order numbers follow the format WG-XXXXXX (for example, WG-AB2C3D). Please check your order confirmation email and try again.',
    });
  }

  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { status: 'error', message: 'Too many verification attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }
    await logVerificationAttempt(ip);

    // ── Step 3: confirm the order exists ──────────────────────────────────────
    const order = await findOrderByNumber(orderNumber);
    if (!order) {
      await logAudit({ code, orderNumber, email, status: 'failed_order_not_found', failureReason: 'Order not found in database', ip, userAgent });
      return NextResponse.json({
        status: 'order_not_found',
        message: 'We could not find an order with that number. Please check your confirmation email for the correct order number and try again.',
      });
    }

    // ── Step 4: confirm email matches the order ────────────────────────────────
    if (order.email.toLowerCase() !== email) {
      await logAudit({ code, orderNumber, email, status: 'failed_email_mismatch', failureReason: 'Email does not match order', ip, userAgent });
      return NextResponse.json({
        status: 'email_mismatch',
        message: 'The email address you entered does not match the one used to place this order. Please use the email address from your order confirmation.',
      });
    }

    // ── Step 5: confirm a Windsor Glow account exists for this email ───────────
    const customer = await findCustomerByEmail(email);
    if (!customer || customer.account_status === 'pending_password') {
      await logAudit({ code, orderNumber, email, status: 'failed_no_account', failureReason: customer ? 'Account not activated' : 'No account found', ip, userAgent });
      return NextResponse.json({
        status: 'no_account',
        message: 'Product verification is an account-based feature. To verify your product, please sign in to — or create — your Windsor Glow account using the email address associated with your order.',
      });
    }

    // ── Step 6: look up the verification code ─────────────────────────────────
    const record = await findVerificationCode(code);
    if (!record) {
      await logAudit({ code, orderNumber, email, status: 'failed_invalid_code', failureReason: 'Code not found', ip, userAgent, customerId: customer.id, customerName: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.email });
      return NextResponse.json({
        status: 'invalid',
        message: 'We could not find a product matching that code. Please double-check the code printed on your product packaging and try again, or contact our support team for help.',
      });
    }

    if (record.status === 'used') {
      await logAudit({ code, orderNumber, email, status: 'failed_already_used', failureReason: 'Code already used', ip, userAgent, productName: record.product_name, customerId: customer.id, customerName: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.email, isRepeat: true });
      return NextResponse.json({
        status: 'already_used',
        message: 'This code has already been verified and cannot be used again. Each Windsor Glow verification code is valid for one check only. If you believe this is an error, please contact our support team with your order details.',
        productName: record.product_name,
      });
    }

    // ── Step 7: atomically claim the code ─────────────────────────────────────
    const claimed = await markVerificationCodeUsed({
      code,
      email,
      orderNumber,
      ip,
      userAgent,
      marketingConsent: false,
    });

    if (!claimed) {
      await logAudit({ code, orderNumber, email, status: 'failed_already_used', failureReason: 'Race condition — claimed between lookup and update', ip, userAgent, productName: record.product_name, customerId: customer.id, customerName: `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.email, isRepeat: true });
      return NextResponse.json({
        status: 'already_used',
        message: 'This code has already been verified and cannot be used again. Each Windsor Glow verification code is valid for one check only.',
        productName: record.product_name,
      });
    }

    const customerName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || customer.email;
    await logAudit({ code, orderNumber, email, status: 'verified', failureReason: null, ip, userAgent, productName: record.product_name, customerId: customer.id, customerName });

    return NextResponse.json({
      status: 'verified',
      message: 'Verification successful. This product is genuine and your code has now been registered.',
      productName: record.product_name,
      batchRef: record.batch_ref,
      purity: record.purity,
    });

  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Something went wrong while verifying your product. Please try again shortly.' },
      { status: 500 }
    );
  }
}

// Thin wrapper so audit logging never throws and always has consistent shape.
async function logAudit(params: {
  code: string;
  orderNumber: string;
  email: string;
  status: VerificationAuditStatus;
  failureReason: string | null;
  ip: string;
  userAgent: string | null;
  productName?: string | null;
  customerId?: number | null;
  customerName?: string | null;
  isRepeat?: boolean;
}) {
  try {
    await logVerificationAuditEntry({
      code: params.code,
      productName: params.productName ?? null,
      orderNumber: params.orderNumber,
      customerId: params.customerId ?? null,
      customerName: params.customerName ?? null,
      customerEmail: params.email || null,
      status: params.status,
      failureReason: params.failureReason,
      isRepeatAttempt: params.isRepeat ?? false,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  } catch {
    // Audit logging must never break the verification response.
  }
}
