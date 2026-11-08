# Beauty product links

> **Purpose:** Record the local product-link editor, permanent old links and safety checks.
> **Status:** BUILT; not published
> **Related projects:** Windsor Beauty only; Glow was a read-only reference.
> **Dependencies:** Reviewed product-address migration, joined build and browser acceptance.
> **Key decisions:** Explicit Save link; internal product keys, stock, prices and order records stay unchanged. No live migration, customer communication or publishing.
> **Next steps:** Owner release review. The migration, rename and old-link redirect passed the isolated joined browser checkpoint; no live installation/publication yet.
> **Last updated:** 2026-11-08

## What changed

Products has a **Manage product links** section. Staff can find a product, type a public link or suggest one from its name, and save explicitly. Renaming a product elsewhere does not silently change its public link. Existing links redirect to the current one. The product's internal slug remains its stock/order/review key.

The permanent `beauty_product_web_addresses` registry owns current and earlier links. It does not cap or discard older aliases. Reserved bundle and legacy routes cannot be claimed. Deleted products leave reserved addresses behind, so their old links cannot later open an unrelated product. Reusing a deleted internal slug is also refused; a recreated listing needs a fresh key.

A narrow database trigger serializes catalogue writes with link changes. Ordinary product saves cannot erase or replace the registry history. New product creation is insert-only, preventing a concurrent duplicate Create from overwriting an existing product. When the migration is installed, new numeric product IDs are allocated under the same catalogue lock. Link changes never rewrite the full product row.

Product pages resolve current links, previous links and internal keys through one helper. Old-link requests redirect before rendering. Hidden and restricted products still fail closed before a redirect. Product cards, shop metadata, product canonicals, sitemap and bundle component links use current public links. Saved baskets, old emails and other slug-only references remain valid through the retained internal-key redirect. Analytics paths map back to their original product keys, including historical deleted keys.

## Installation and rollback

Apply `scripts/install-beauty-product-addresses.sql` in one transaction to the reviewed Beauty database before releasing the UI. The script uses short lock/statement timeouts, checks existing namespaces, reserves fixed routes, creates the registry and invoker functions, and installs catalogue triggers. It does not change existing products, prices, stock, orders or customer data. A conflicting existing route aborts the transaction rather than silently choosing an owner. Installation is idempotent and does not reset a previously changed link.

Run as the reviewed application owner, or explicitly grant the required table/function privileges to the actual application role. Function execution is revoked from PUBLIC. Do not assume privileges from an administrator test are the deployed role's privileges.

Before installation, reads continue with the previous link behaviour and the editor clearly says it is not installed. After installation, keep the registry and address-aware resolver in any rollback. Reverting to code that cannot read the registry would break newly assigned public links. Do not drop the registry or delete historical aliases as a rollback shortcut. Disable editing or revert the affected narrow UI instead.

## Evidence

- `scripts/test-beauty-product-addresses.mjs`: **63 checks** using actual SQL functions, triggers, migration, database helpers, HTTP handlers and server product-page resolution against synthetic in-memory PostgreSQL. Covers authentication, foreign origin, stale saves, reserved and duplicate addresses, 55 consecutive renames, old aliases, hidden products, canonical URLs, create-only preservation, migration idempotence and failed-migration rollback.
- `scripts/test-beauty-product-address-concurrency.mjs`: **33 checks** using three real connections to a fresh loopback-only PostgreSQL cluster. Covers two products claiming one link, stale editors, ordinary product writes, creation versus rename, distinct simultaneous product IDs, duplicate Create, rollback, deletion, unchanged stock and no PUBLIC function execution. Receipt: `.local-evidence/product-addresses/2026-11-08T19-46-06-452Z/receipt.json`. Instance stopped; STOPPED receipt retained.
- Existing product draft checks: **34 passed** after updating the harness to load the new pure address helper. The existing full parser, route and conditional SQL checks remain meaningful.
- SEO source checks: **36 passed**, now checking current product links in the sitemap and existing fixed redirects.
- TypeScript and focused lint passed. Root coordinates the joined production build and actual browser review; this note does not claim those have passed yet.

The first native test encountered a sandbox localhost permission error and shut down its own instance. The authorized isolated retry passed. No existing database, environment file, live mailbox or provider service was opened. No source was pushed.

**Hard-drive transfer needed** for this local source and evidence until an approved GitHub release and evidence handover.
