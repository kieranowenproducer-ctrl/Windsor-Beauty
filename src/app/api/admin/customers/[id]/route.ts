import { NextResponse } from 'next/server';
import {
  deleteCustomer,
  emailTakenByAnotherCustomer,
  findCustomerById,
  renameMarketingContactEmail,
  setMarketingConsentByEmail,
  updateCustomerDetails,
  upsertMarketingContact,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

// Trim to a string, or null when the field is left blank — these columns are
// nullable and an empty string would render as a blank line in the address block.
function optional(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : '';

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'Please enter both a first and last name.' }, { status: 400 });
  }

  const existing = await findCustomerById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  // Email is the login identifier, so it only changes when explicitly sent and is
  // never blanked. Any field the caller omits keeps its current value, so a body
  // carrying just the name behaves exactly as it did before this route widened.
  const email =
    typeof body?.email === 'string' && body.email.trim() !== '' ? body.email.trim() : existing.email;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  if (
    email.toLowerCase() !== existing.email.toLowerCase() &&
    (await emailTakenByAnotherCustomer(id, email))
  ) {
    return NextResponse.json(
      { error: 'Another account already uses that email address.' },
      { status: 409 }
    );
  }

  const sent = (key: string) => Object.prototype.hasOwnProperty.call(body ?? {}, key);

  const updated = await updateCustomerDetails(id, {
    firstName,
    lastName,
    email,
    phone: sent('phone') ? optional(body.phone) : existing.phone,
    referredBy: sent('referredBy') ? optional(body.referredBy) : existing.referred_by,
    addressLine1: sent('addressLine1') ? optional(body.addressLine1) : existing.address_line1,
    addressLine2: sent('addressLine2') ? optional(body.addressLine2) : existing.address_line2,
    addressCity: sent('addressCity') ? optional(body.addressCity) : existing.address_city,
    addressPostcode: sent('addressPostcode') ? optional(body.addressPostcode) : existing.address_postcode,
    addressCountry: sent('addressCountry') ? optional(body.addressCountry) : existing.address_country,
    marketingConsent:
      typeof body?.marketingConsent === 'boolean' ? body.marketingConsent : existing.marketing_consent,
  });

  if (!updated) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  // Carry the edit onto the marketing list (task 99476dc9). This route used to
  // write the customer row and stop, so ticking "Opted in to marketing" here
  // left the Email Marketing page none the wiser and the person still could
  // not be emailed. Order matters: rename first, so the consent change lands
  // on the row that followed the customer to their new address.
  try {
    if (updated.email.toLowerCase() !== existing.email.toLowerCase()) {
      await renameMarketingContactEmail(existing.email, updated.email);
    }
    // Only when the tick box was actually CHANGED. Acting on every save would
    // mean correcting somebody's postcode quietly put them back on the mailing
    // list after they had unsubscribed.
    if (updated.marketing_consent !== existing.marketing_consent) {
      if (updated.marketing_consent) {
        await upsertMarketingContact({
          email: updated.email,
          firstName: updated.first_name,
          lastName: updated.last_name,
          phone: updated.phone,
          customerId: updated.id,
          source: 'customer_account',
        });
      } else {
        await setMarketingConsentByEmail(updated.email, false);
      }
    }
  } catch {
    // The customer edit itself is saved. A marketing list that lags by one
    // edit is put right the next time the Email Marketing page is opened,
    // which re-syncs; failing the whole save here would be worse.
  }

  return NextResponse.json({
    customer: {
      id: updated.id,
      firstName: updated.first_name,
      lastName: updated.last_name,
      email: updated.email,
      phone: updated.phone,
      referredBy: updated.referred_by,
      addressLine1: updated.address_line1,
      addressLine2: updated.address_line2,
      addressCity: updated.address_city,
      addressPostcode: updated.address_postcode,
      addressCountry: updated.address_country,
      marketingConsent: updated.marketing_consent,
    },
  });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid customer id.' }, { status: 400 });
  }

  const deleted = await deleteCustomer(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
