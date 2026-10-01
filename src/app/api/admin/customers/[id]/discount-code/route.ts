import { NextResponse } from 'next/server';
import { findCustomerById, setDiscountSignupStatus } from '@/lib/db';
import { ensureMemberDiscountCode } from '@/lib/memberDiscountCode';

export const dynamic = 'force-dynamic';

// Burn or restore a member's signup discount code by hand.
//
// Needed because a code can be settled outside checkout — the customer was
// given their 10% another way, or a goodwill order was placed for them — and
// until now there was no way to stop them also spending the code later.
// Codes are burned automatically at checkout by /api/checkout/place-order;
// this is the manual override for everything that happens off that path.
//
// Protected by the admin session cookie gate in src/proxy.ts, which
// covers every /api/admin route.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (status !== 'used' && status !== 'active' && status !== 'issue') {
    return NextResponse.json(
      { error: "Set status to 'used' to burn the code, 'active' to restore it, or 'issue' to give them one." },
      { status: 400 }
    );
  }

  const customer = await findCustomerById(id);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  // Giving somebody their 10% by hand (task efa43ea1). The customer's own page
  // showed "Not issued" and offered nothing to press. Reuse-or-create, exactly
  // as verification and the admin resend already do, so an address that has a
  // code keeps the one it has rather than collecting a second.
  if (status === 'issue') {
    if (customer.discount_code) {
      return NextResponse.json({ success: true, code: customer.discount_code, status: 'active' });
    }
    const code = await ensureMemberDiscountCode(customer);
    if (!code) {
      return NextResponse.json({ error: 'Could not issue a code. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ success: true, code, status: 'active' });
  }

  if (!customer.discount_code) {
    return NextResponse.json({ error: 'This customer has no discount code issued.' }, { status: 400 });
  }

  const updated = await setDiscountSignupStatus(customer.discount_code, status);
  if (!updated) {
    return NextResponse.json(
      { error: `No signup record found for code ${customer.discount_code}.` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    code: updated.code,
    status: updated.status,
    usedAt: updated.used_at,
  });
}
