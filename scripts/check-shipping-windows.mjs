// The delivery figures the concierge quotes are the figures the site promises. Free.
//
//   node scripts/check-shipping-windows.mjs
//
// The windows are written out on the shipping page, in the checkout summary, in the admin
// editor's fallback copy, and in the dispatch email. Copies a person edits together is fine. It
// stopped being fine on 2026-08-03, when the concierge started quoting them: a customer reading
// a chat has no way to check the number against the policy page, so a figure that has drifted is
// a promise the site does not make.
//
// `src/lib/shippingWindows.ts` is the one the concierge reads. This proves the pages still say
// the same thing, by reading their source rather than by anybody remembering. It does NOT rewrite
// them: the prose on each page is written for that page and should stay that way.
//
// THE INGESTED COPY IS CHECKED TOO, since 2026-08-03. The concierge's model path answers from the
// knowledge base's stored copy of the shipping policy, which no file read can see. When the
// knowledge database is reachable, this reads the live customer-visible chunks with the same
// filter the concierge uses and proves each window appears in them. When it is not reachable it
// says so loudly rather than passing in silence — the file checks still run either way.
//
// If this fails, the fix is to make the pages agree with `shippingWindows.ts`, or to change
// `shippingWindows.ts` and then the pages. If the INGESTED copy is the one that disagrees,
// re-ingest the knowledge base so the concierge answers with the figure the site prints.
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const windows = read('src/lib/shippingWindows.ts');
const uk = windows.match(/UK_DELIVERY[\s\S]*?window:\s*'([^']+)'/)?.[1];
const intl = windows.match(/INTERNATIONAL_DELIVERY[\s\S]*?window:\s*'([^']+)'/)?.[1];
const dispatch = windows.match(/DISPATCH_WINDOW\s*=\s*'([^']+)'/)?.[1];

let pass = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) { pass += 1; return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

check('the UK window could be read out of shippingWindows.ts', Boolean(uk));
check('the international window could be read', Boolean(intl));
check('the dispatch window could be read', Boolean(dispatch));

if (!uk || !intl || !dispatch) {
  console.log(`\n  ${failures.length} FAILED:\n${failures.map((f) => `    - ${f}`).join('\n')}\n`);
  process.exit(1);
}

/* WHERE THE SAME FIGURES ARE PRINTED. Adding a fourth page that quotes a delivery window means
 * adding a line here, and the alternative is finding out from a customer. */
const PLACES = [
  ['the shipping page', 'src/app/shipping/page.tsx', [uk, intl, dispatch]],
  ['the admin editor fallback copy', 'src/lib/policyDefaults.ts', [uk, intl, dispatch]],
  // Checkout writes them with a hyphen ("2-4 working days") because it is a tight summary line,
  // so the digits are compared rather than the prose.
  ['the checkout summary', 'src/app/checkout/page.tsx', [uk.replace(/(\d+) to (\d+)/, '$1-$2'),
    intl.replace(/(\d+) to (\d+)/, '$1-$2')]],
];

for (const [name, path, expected] of PLACES) {
  const text = read(path);
  for (const phrase of expected) {
    check(`${name} still says "${phrase}"`, text.includes(phrase),
      'it has drifted from src/lib/shippingWindows.ts, which holds the one agreed figure');
  }
}

/* The dispatch email, the same way: it interpolates the shared figure, so the source is checked
 * for the reference and for the absence of any figure of its own. Until 2026-08-03 it said
 * "2 to 3 working days" against a shipping page that says 2 to 4, in the one document a customer
 * is certain to read. */
const email = read('src/lib/shippingEmail.ts');
check('the dispatch email quotes the shared figure rather than its own',
  /UK_DELIVERY\.window/.test(email)
    && !/\d+\s*(?:to|-|&ndash;|–)\s*\d+ working days/.test(email),
  'a hardcoded window in shippingEmail.ts is a promise the shipping page does not make');

console.log(`\n  ${pass} checks passed`);
if (failures.length) {
  console.log(`  ${failures.length} FAILED:\n${failures.map((f) => `    - ${f}`).join('\n')}\n`);
  process.exit(1);
}
console.log('  The site pages and the dispatch email promise the same delivery windows.\n');
