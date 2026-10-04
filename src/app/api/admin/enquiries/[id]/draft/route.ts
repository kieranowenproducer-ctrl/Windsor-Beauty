import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';
import { findLatestOrderByEmail, type OrderRow } from '@/lib/db/orders';
import { findEnquiryById, findLatestCustomerReply } from '@/lib/db/enquiries';
import { findOrderRef } from '@/lib/replyCapture';
import {
  enquiryNeedsHumanAction,
  enquiryNeedsPersonalAdvice,
  looksLikeOrderStatusQuestion,
  orderStatusEmailCopy,
  orderDraftSnapshot,
} from '@/lib/email/enquiryAutoDraft';

export const dynamic = 'force-dynamic';

function orderNumberIn(message: string): string | null {
  return findOrderRef(message);
}

async function relatedOrder(enquiry: { order_number: string | null; message: string; email: string }): Promise<OrderRow | null> {
  // A Glow reference is never an instruction to use Beauty's latest order.
  // Keep mixed-business enquiries for a person to check.
  if (/\bWG-[A-Z0-9]{4,}(?:-[A-Z0-9]+)*\b/i.test(`${enquiry.order_number || ''}\n${enquiry.message}`)) return null;
  const reference = enquiry.order_number || orderNumberIn(enquiry.message);
  if (reference) {
    const normalized = reference.trim().toUpperCase();
    if (findOrderRef(normalized) !== normalized) return null;
    const order = await findOrderByNumber(normalized).catch(() => null);
    return order?.email.toLowerCase() === enquiry.email.toLowerCase() ? order : null;
  }
  return findLatestOrderByEmail(enquiry.email).catch(() => null);
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid enquiry id.' }, { status: 400 });
  }

  const enquiry = await findEnquiryById(id);
  if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });

  /* WHAT THE DRAFT HAS TO ANSWER (task bb0a850f).
   *
   * The enquiry's own message is the question they asked at the start, and on a thread that has
   * been replied to, somebody has already answered it. If the customer has written since, that
   * follow-up is the live question: answering the original instead would send them a second copy
   * of yesterday's answer and read as though nobody had listened. */
  const latestFromCustomer = await findLatestCustomerReply(enquiry.id).catch(() => null);
  const question = latestFromCustomer?.body?.trim() || enquiry.message;

  const order = await relatedOrder(enquiry);

  if (enquiryNeedsHumanAction(question)) {
    return NextResponse.json({
      draft: {
        format: 'manual',
        source: 'Human check',
        note: 'This enquiry asks for an action or reports a problem, so no automatic reply was prepared.',
      },
    });
  }


  if (enquiryNeedsPersonalAdvice(question)) {
    return NextResponse.json({
      draft: {
        format: 'manual',
        source: 'Human check',
        note: 'This customer is asking what is right for them personally. No automatic product reply was prepared.',
      },
    });
  }

  if (looksLikeOrderStatusQuestion(enquiry.subject_key, question, enquiry.order_number)) {
    if (!order) {
      return NextResponse.json({ draft: { format: 'manual', source: 'Order records', note: 'No matching order was found. Check the order number or customer email before replying.' } });
    }
    return NextResponse.json({
      draft: {
          format: 'order',
          message: orderStatusEmailCopy(order),
          orderNumber: order.order_number,
          orderSnapshot: orderDraftSnapshot(order),
          generatedAt: new Date().toISOString(),
        source: 'Live order record',
        note: `Prepared from ${order.order_number}. Check the status and tracking details before sending.`,
      },
    });
  }

  return NextResponse.json({
    draft: {
      format: 'manual',
      source: 'Human check',
      note: 'This enquiry does not match a live order-status check. Write the reply normally.',
    },
  });
}
