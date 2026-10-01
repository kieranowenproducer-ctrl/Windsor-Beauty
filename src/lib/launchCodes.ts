// One shared implementation of "make sure this email has a stored 10% signup
// code" — reuse-or-create semantics identical to /api/account/verify-email:
// discount_signups.email is UNIQUE so an email is never double-issued. The
// code is STORED only (customers.discount_code + launch_subscribers row) —
// nothing here emails it to the customer; the welcome email still only goes
// out on first email verification, and the launch email reads the stored
// code when Kieran presses send.
import {
  createDiscountSignup,
  findCustomerByEmail,
  findDiscountSignupByEmail,
  setCustomerDiscountCode,
  setLaunchSubscriberDiscountCode,
} from '@/lib/db';
import { generateSignupDiscountCode } from '@/lib/discountCodes';

export async function ensureStoredSignupCode(
  email: string,
  opts: { marketingConsent?: boolean; customerId?: number | null } = {}
): Promise<string | null> {
  let code: string | null = null;

  const existingSignup = await findDiscountSignupByEmail(email).catch(() => null);
  if (existingSignup) {
    // 'used' means they already redeemed a code from another path — do not
    // issue a second one, and do not overwrite what history says happened.
    code = existingSignup.status === 'active' ? existingSignup.code : null;
  } else {
    for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
      const created = await createDiscountSignup({
        email,
        code: generateSignupDiscountCode(),
        marketingConsent: opts.marketingConsent ?? false,
      }).catch(() => null);
      if (created) code = created.code;
    }
  }

  if (code) {
    let customerId = opts.customerId ?? null;
    if (customerId == null) {
      const customer = await findCustomerByEmail(email).catch(() => null);
      customerId = customer?.id ?? null;
    }
    if (customerId != null) {
      await setCustomerDiscountCode(customerId, code).catch(() => {});
    }
    await setLaunchSubscriberDiscountCode(email, code).catch(() => {});
  }
  return code;
}
