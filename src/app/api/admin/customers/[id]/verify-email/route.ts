import { NextResponse } from 'next/server';
import {
  clearCustomerEmailVerified,
  findCustomerById,
  isDbConfigured,
  markCustomerEmailVerified,
} from '@/lib/db';
import { ensureMemberDiscountCode } from '@/lib/memberDiscountCode';

export const dynamic = 'force-dynamic';

// Setting a customer's email verification by hand (task efa43ea1).
//
// Why staff need this at all: verification is the gate on the 10% member
// discount, and some email providers simply eat the link. Until now the only
// answer on the page was "send it again", which does not help the customer
// whose provider will never deliver it. Whoever is on the phone to them can
// now confirm the address the same way they would confirm it in person.
//
// POST marks them verified and does everything the real click does, so nobody
// ends up verified with no discount code. DELETE is the undo.
//
// Protected by the admin session gate in src/proxy.ts, which covers every
// /api/admin route.

function customerId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = customerId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const customer = await findCustomerById(id);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  if (customer.email_verified) {
    return NextResponse.json({ message: 'This email address was already confirmed.', discountCode: customer.discount_code });
  }

  const updated = await markCustomerEmailVerified(id);
  if (!updated) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  // Same order as the customer's own click: confirm first, then issue (or
  // reuse) the code. Reuse-or-create, so an address that already has a code
  // never gets a second one.
  const discountCode = await ensureMemberDiscountCode(updated).catch(() => null);

  return NextResponse.json({
    success: true,
    discountCode,
    message: discountCode
      ? `Confirmed by hand. Their 10% code is ${discountCode}.`
      : 'Confirmed by hand.',
  });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = customerId(params.id);
  if (id === null) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const updated = await clearCustomerEmailVerified(id);
  if (!updated) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: 'Set back to not confirmed. Any code they already have still works.',
  });
}
