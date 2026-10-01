// Which address a customer lookup offers, and whether it is a billing address at all.
//
// Pulled out of the database query (task 77b818aa) because it is the rule that went wrong, and a
// rule nobody can test is a rule that breaks again. No database access here: it takes the rows the
// query returned and decides what one person's details are.
//
// What went wrong: a customer paid for an order that had to go to a friend, at the friend's
// address. Raising the NEXT invoice for her offered the friend's address as her billing address.
// Her own record had never changed — the lookup gathers a person from three places (their member
// record, their most recent order, their most recent invoice), and it used to keep whichever row
// came first. Rows arrive newest first, so the order won, and an order's address is where the
// PARCEL WENT. A one-off delivery was being presented as where she lives.
//
// The rule now: a billing address may only come from a billing source — the customer's own saved
// record, or the billing address of a past invoice. A delivery address is still offered when it is
// all there is, but it says so, and the invoice editor puts it in the delivery section instead.

/** A single person the admin can drop onto a bespoke invoice. */
export interface InvoiceCustomerMatch {
  source: 'member' | 'order' | 'invoice';
  /**
   * TRUE only when the address on this match is genuinely a BILLING address — the customer's own
   * saved address, or the billing address of a past invoice. FALSE when all we hold is where a
   * past parcel was DELIVERED, which can be a one-off and must never fill in a billing address.
   */
  billingAddressIsReal: boolean;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  lastActivity: string | null;
}

/** What the query returns, before any of this is decided. */
export type InvoiceCustomerRow = Omit<InvoiceCustomerMatch, 'billingAddressIsReal'>;

/** An order's address is where a parcel went. Only the other two are billing addresses. */
const isBillingSource = (source: InvoiceCustomerMatch['source']) => source !== 'order';

/** Which source describes a person best, for the label and for tie-breaks. */
const PRIORITY: Record<InvoiceCustomerMatch['source'], number> = { member: 3, invoice: 2, order: 1 };

const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'postcode', 'country'] as const;
const hasAddress = (r: { line1: string | null; postcode: string | null }) => Boolean(r.line1 || r.postcode);

/**
 * Merges rows that are the same person (matched on email) into one set of details.
 *
 * Non-address details fill in each other's blanks, because a phone number from one place and a
 * company name from another are both simply true. The address does NOT: it moves as one block, and
 * a better source replaces a worse one outright. Half of one address and half of another is
 * nobody's address, and posting to it would be worse than posting to neither.
 */
export function mergeInvoiceCustomers(rows: InvoiceCustomerRow[], limit: number): InvoiceCustomerMatch[] {
  const byEmail = new Map<string, InvoiceCustomerMatch>();

  const copyAddress = (to: InvoiceCustomerMatch, from: InvoiceCustomerRow) => {
    for (const f of ADDRESS_FIELDS) to[f] = from[f];
    to.billingAddressIsReal = isBillingSource(from.source);
  };

  for (const raw of rows) {
    const key = (raw.email || '').toLowerCase();
    if (!key) continue;
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, { ...raw, billingAddressIsReal: hasAddress(raw) && isBillingSource(raw.source) });
      continue;
    }

    for (const f of ['name', 'phone', 'company'] as const) {
      if (!existing[f] && raw[f]) existing[f] = raw[f];
    }

    if (hasAddress(raw)) {
      const better =
        // Anything beats nothing.
        !hasAddress(existing) ||
        // A real billing address always beats a delivery address, however old it is.
        (isBillingSource(raw.source) && !existing.billingAddressIsReal) ||
        // Between two of the same kind, the better-quality source wins.
        (isBillingSource(raw.source) === existing.billingAddressIsReal && PRIORITY[raw.source] > PRIORITY[existing.source]);
      if (better) copyAddress(existing, raw);
    }

    if (PRIORITY[raw.source] > PRIORITY[existing.source]) existing.source = raw.source;
  }

  return Array.from(byEmail.values()).slice(0, limit);
}
