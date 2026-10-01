/**
 * Words that the Orders and Invoices search should treat as the same word.
 *
 * Each line is "these words all mean the same thing", for example two spellings of one product.
 * Type one and the search also looks for the others. A word in quotes is searched for exactly as
 * typed and ignores this list.
 *
 * The list is empty, so the search works on the plain words typed. To add a group, write a line
 * such as ['moisturiser', 'moisturizer']. Keep every word in lower case and at least three
 * letters long, or it would match almost every order.
 *
 * Invoices read this list directly on the server. Orders search in the browser, so the Orders API
 * hands the list down with the orders.
 */
const SHOP_WORD_GROUPS: string[][] = [];

/** Lower case, accents flattened. Must match fold() in src/lib/adminSearch.ts. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function buildGroups(): string[][] {
  const groups: string[][] = [];
  for (const line of SHOP_WORD_GROUPS) {
    const cleaned = Array.from(new Set(
      line.map(fold).filter(w => w.length >= 3 && /[a-z0-9]/.test(w))
    ));
    if (cleaned.length >= 2) groups.push(cleaned);
  }
  return groups;
}

/** Every set of words that mean the same thing. One word may appear in more than one set. */
export const SEARCH_ALIAS_GROUPS: string[][] = buildGroups();
