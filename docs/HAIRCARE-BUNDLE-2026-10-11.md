# Shampoo, conditioner and bundle release

> **Purpose:** Record the approved haircare prices and how bundle stock works.
> **Status:** LIVE; live publication evidence is in the workspace batch-06 production record.
> **Related projects:** Windsor Beauty.
> **Dependencies:** Two live database products and the active automatic bundle price rule.
> **Key decisions:** Shampoo and conditioner cost £18.99 for guests and members. One of each costs £34.99, saving £2.99. Bundle inventory uses the component bottles.
> **Next steps:** Owner real PayPal and Fena payment test, including received funds and status/email checks.
> **Last updated:** 2026-10-11

Kieran approved both individual photos and the wider-spaced two-bottle photo, authorised live publication and confirmed five bottles of each. Product data and photos are published through the normal Beauty admin APIs to its own database and Blob store. The bundle is a separate storefront listing and page, with one button adding one shampoo and one conditioner. It is not a separate stocked database product.

The existing automatic promotion rule provides the bundle discount in both the basket preview and server checkout. Adding both products separately also qualifies. Repeated pairs each save £2.99; unmatched bottles retain their £18.99 price. Removing a bottle removes its pair's saving. Orders, invoices, payment totals and dispatch continue to contain the physical bottle lines. Stock checks and reservations use those lines. An unavailable component disables the bundle; a hidden or inaccessible component removes the offer entirely. No untracked stock is treated as unlimited for this bundle.

The live browser check caught the quick basket drawer omitting automatic promotions. It now uses the same preview as the full basket and checkout. Preview responses are tied to the current basket and cancelled after quantity changes, so an earlier response cannot overwrite a newer basket's saving. Guests with no member saving can proceed directly from either basket view.

Only these two slugs are exempt from the existing non-member markup. Their prices are re-derived from the catalogue on the server. Guest member-saving pop-ups are suppressed for a basket with no member saving; mixed baskets retain the existing savings for other products.

Validation: TypeScript, production webpack build, full `npm run check`, changed-file ESLint, nine bundle/member-pricing tests, the isolated PGlite PayPal/no-email/stock-release test, Fena confirmation/webhook replay test, retired-feature checks and email archive check passed. Full-repository ESLint has three pre-existing script errors and two unrelated warnings; no lint error is introduced in the changed files. Local Turbopack cannot build the external node_modules junction, so the complete production build used webpack. Hosted dependencies are installed normally.

No payment, order, refund or customer email is created by the read-only live quote checks. The two low-stock emails from preparing stock were separate alerts, one per bottle product. Kieran confirmed two total, not two copies of one alert; Resend records each once to sales and the info inbox search had no matching copy. This does not justify another forwarding change. Existing six-unit low-stock threshold and episode tracking remain unchanged.

PayPal opens its direct payment page and keeps the on-screen resume link; no customer PayPal link email is sent. Staff must verify the actual payment in PayPal. Fena payment must be confirmed by its authenticated callback, not merely by a success URL. Actual settlement and post-payment email delivery remain the owner live test. Product shipping weights remain unmeasured; use measured bottle and parcel weights before dispatch, rather than treating 350ml as shipping grams.

For rollback, disable the new bundle promotion and set the two new products to coming soon through the normal admin APIs. Preserve physical stock, old catalogue products and today's enquiry filter. Revert only this release's code if necessary; do not restore the historical private email candidate or change storefront access.
