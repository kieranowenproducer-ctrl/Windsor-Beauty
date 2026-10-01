import {
  createDiscountSignup,
  findDiscountSignupByEmail,
  setCustomerDiscountCode,
  setLaunchSubscriberDiscountCode,
  type CustomerRow,
} from '@/lib/db';
import { generateSignupDiscountCode } from '@/lib/discountCodes';

/**
 * Get this customer's 10% member code, creating it if they do not have one yet.
 *
 * Lifted out of /api/account/verify-email so the admin resend can hand a customer a working code
 * without them having to click anything. Reuse-or-create is the important part and is unchanged:
 * discount_signups.email is UNIQUE, so somebody who already has a row can never be issued a
 * second code, however many times this is called.
 *
 * Returns null only if the code could not be created at all, which the caller must treat as "no
 * code to show" rather than as a failure of whatever it was doing.
 */
export async function ensureMemberDiscountCode(customer: CustomerRow): Promise<string | null> {
  if (customer.discount_code) return customer.discount_code;

  let discountCode: string | null = null;

  const existingSignup = await findDiscountSignupByEmail(customer.email).catch(() => null);
  if (existingSignup) {
    if (existingSignup.status === 'active') discountCode = existingSignup.code;
  } else {
    // Retried because the code is random and the column is unique: a collision is possible,
    // just very unlikely. Five attempts is well past the point of paranoia.
    for (let attempt = 0; attempt < 5 && !discountCode; attempt += 1) {
      const created = await createDiscountSignup({
        email: customer.email,
        code: generateSignupDiscountCode(),
        marketingConsent: customer.marketing_consent,
      }).catch(() => null);
      if (created) discountCode = created.code;
    }
  }

  if (discountCode) {
    await setCustomerDiscountCode(customer.id, discountCode).catch(() => {});
    await setLaunchSubscriberDiscountCode(customer.email, discountCode).catch(() => {});
  }

  return discountCode;
}
