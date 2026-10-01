// Stops a trial product's real name going out in text an admin typed by hand.
//
// Picked trial lines are already safe: the server swaps the name for the
// permanent Product code (parseInvoiceInput) and every outward document masks
// them again (anonymiseTrialLines). But the Subject, Message, Footer and
// Customer-Facing Notes boxes, and a hand-typed line, go out exactly as
// written. Kieran, 16 Sept 2026: a real trial name has gone out on an invoice
// email before, so saving or sending must stop whenever one appears there.
//
// Whole-word matching, ignoring case and punctuation, so "T-300" matches
// "t 300" but "decide" does not match "dec". Short names are checked too: a
// false alarm only needs rewording ("5 December"), a leak cannot be undone.
// Product codes ("Product 284") are allowed in the text boxes.

export interface TrialNameSource { name: string }

export interface TrialTextLeak {
  /** The on-screen label of the box, so the admin knows where to look. */
  field: string;
  /** The trial product name that was found. */
  trialName: string;
}

const comparable = (value: string) =>
  ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')} `;

const TEXT_FIELDS: { keys: string[]; label: string }[] = [
  { keys: ['subject'], label: 'Subject / Header Text' },
  { keys: ['message'], label: 'Message to Customer' },
  { keys: ['footerText', 'footer_text'], label: 'Footer / Disclaimer Text' },
  { keys: ['customerNotes', 'customer_notes'], label: 'Customer-Facing Notes' },
];

/**
 * The first trial name found in the customer-facing typed text of an invoice,
 * or null when there is none. Accepts the builder's payload (camelCase) or a
 * saved invoice row (snake_case). Picked trial lines are skipped: their name
 * is replaced by the code on save.
 */
export function findTrialNameInInvoiceText(
  invoice: Record<string, unknown>,
  trialProducts: readonly TrialNameSource[],
): TrialTextLeak | null {
  const names = trialProducts
    .map((p) => ({ original: p.name.trim(), key: comparable(p.name) }))
    .filter((n) => n.key.trim().length > 0);
  if (names.length === 0) return null;

  const check = (text: unknown, field: string): TrialTextLeak | null => {
    if (typeof text !== 'string' || !text.trim()) return null;
    const haystack = comparable(text);
    const hit = names.find((n) => haystack.includes(n.key));
    return hit ? { field, trialName: hit.original } : null;
  };

  for (const { keys, label } of TEXT_FIELDS) {
    for (const key of keys) {
      const leak = check(invoice[key], label);
      if (leak) return leak;
    }
  }

  const lines = invoice.lineItems ?? invoice.line_items;
  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] as Record<string, unknown> | null;
      if (!line || typeof line !== 'object') continue;
      const isTrial = line.type === 'trial' || (typeof line.slug === 'string' && line.slug.startsWith('trial:'));
      if (isTrial) continue;
      const leak = check(line.name, `Line item ${i + 1}`) ?? check(line.description, `Line item ${i + 1}`);
      if (leak) return leak;
    }
  }
  return null;
}

/** The plain-English refusal shown to the admin. */
export function trialTextLeakMessage(leak: TrialTextLeak): string {
  return `Not saved: "${leak.field}" contains the trial product name "${leak.trialName}". `
    + 'Customers must only ever see the product code. Remove the name, or pick the product as a Trial line, and try again.';
}
