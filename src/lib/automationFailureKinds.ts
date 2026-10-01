/**
 * What counts as the website going wrong, and what is just something that
 * happened to a customer.
 *
 * The failure log started as "everything the site does on its own that did not
 * work", which was right. Then payment outcomes were added to it, and they are
 * a different kind of thing. A customer's bank declining a payment is ordinary
 * shop life: nothing is broken, nobody has to fix anything, and the customer can
 * simply try again. Filed under a red "something went wrong" heading it looked
 * identical to a dispatch that never happened.
 *
 * That matters more than it sounds. This whole system exists because silent
 * failures were being missed. An alarm that goes off for normal events is an
 * alarm people stop reading, and then the one that genuinely matters is missed
 * too. So the two are separated here, once, and every surface reads it from
 * this file: the dashboard banner, the sidebar badge and the System Health page.
 */

/**
 * Recorded and shown, but never counted as a fault.
 *
 * The bar for adding a category here: a person reading it would say "well, yes,
 * that happens" rather than "who is fixing that?".
 */
export const CUSTOMER_EVENT_CATEGORIES = [
  // A bank or open-banking provider did not complete a payment. The order is
  // left payable on purpose so a retry works, so there is nothing to repair.
  'fena_payment_not_completed',
  // Somebody signed up who looks like an existing customer coming back for a
  // second 10% welcome discount (task c76f31fb). Nothing is broken and nothing
  // needs repairing: it is a judgement for a person, and often innocent. It
  // still shows in red in Latest Activity, which is what Kieran asked for, but
  // it must not add to the count that means "the website is failing".
  'duplicate_account_suspected',
  // Legacy account/discount review categories. New findings live in the
  // dedicated Security Review queue; old rows remain as audit history only.
  'opening_offer_review',
  'welcome_offer_blocked',
  'discount_code_refused',
] as const;

/** True when this category is something that happened, not something that broke. */
export function isCustomerEvent(category: string): boolean {
  return (CUSTOMER_EVENT_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Readable names. Samuel and Kieran read this page, so no raw database slug is
 * ever allowed to reach the screen (see the plain English rule in CLAUDE.md).
 */
export const CATEGORY_LABELS: Record<string, string> = {
  verification_email: 'Verification email',
  verification_email_bulk: 'Verification email (bulk resend)',
  fena_webhook: 'Payment provider message',
  fena_webhook_unhandled_status: 'Payment update we did not recognise',
  fena_payment_not_completed: 'Payment did not go through',
  fena_paid_after_cancel: 'Payment arrived for a cancelled order',
  fena_payment_id: 'Payment reference',
  royal_mail_dispatch: 'Royal Mail dispatch',
  invoice_fulfillment: 'Invoice fulfilment',
  invoice_order_sync: 'Invoice to order sync',
  customer_email: 'Email to a customer',
  admin_email: 'Email to us',
  admin_note: 'Admin note',
  review_email: 'Review email',
  back_in_stock: 'Back in stock alert',
  visitor_tracking: 'Visitor tracking',
  duplicate_account_suspected: 'Possible second account for a second discount',
  opening_offer_review: 'Welcome-offer review (historical)',
  welcome_offer_blocked: 'A customer could not use their welcome code',
  discount_code_refused: 'Discount code was not accepted',
  discount_code_system_failure: 'Discount code system failure',
};

/**
 * A readable name for any category, including one nobody has labelled yet.
 *
 * The page used to fall back to the raw category, which is how
 * "fena_payment_not_completed" ended up on screen: the category was added to
 * the webhook and never to the label list. Turning the slug into words means
 * the next one nobody labels still reads as English.
 */
export function categoryLabel(category: string): string {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const words = category.replace(/[_-]+/g, ' ').trim();
  if (!words) return 'Something else';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
