# Windsor Glow desktop handover

> **Purpose:** Safe transfer of the final laptop work back to the desktop.
> **Status:** READY WITH TWO DATA CHECKS OUTSTANDING
> **Related project:** Windsor Glow website and Glow Card.
> **Dependencies:** GitHub, the existing Vercel project, Neon Postgres and the existing private environment settings.
> **Key decisions:** Remote `main` is the source to bring to the desktop. The pre-sync laptop checkout is preserved on a backup branch. No secrets are stored here.
> **Next steps:** Protect desktop-only work, update from remote `main`, restore local environment values by name, then rerun the checks below.
> **Last updated:** 2026-09-21

## Safe source state

- The final laptop work is on remote `main`.
- The old mixed laptop checkout was preserved before synchronisation on `backup/laptop-website-pre-sync-2026-09-21` at `10bd0ea`.
- Do not merge that backup branch into `main`. It exists only as a recovery copy.
- The current live project is linked locally to Vercel project `windsoglow/windsor-glow`.

## What the desktop is receiving

- The complete Glow Card cycle: signed-in members receive one point for each paid order with at least £30 of products.
- A qualifying referred member receives their order point and referral point. Their referrer receives one referral point.
- Reward stages are £10 at 5 points, £20 at 10 points and £30 at 15 points, each with half-price standard UK delivery.
- The order email shows only the member's current card and the exact number of stamps after the new order has been awarded.
- Duplicate order processing is blocked in the database. A completed 15-point reward begins the next cycle when claimed.
- Email failures do not roll back or lose an earned point or reward. The overnight safeguard makes failed customer and milestone emails visible to staff for follow-up.
- The approved cream-and-gold account card, guide poster and testimonial work are already part of the remote history.

## Environment and database

The desktop's private environment is not transferred through Git. Check these existing names without copying values into source control:

- `DATABASE_URL`
- `RESEND_API_KEY`
- `WG_GLOW_CARD_LOYALTY_ENABLED`
- `NEXT_PUBLIC_WG_GLOW_CARD_LOYALTY_ENABLED`

Both Glow Card flags already exist in Vercel Production. They are now documented in `.env.example`. Add them to the desktop's private local environment only when a local Glow Card preview is needed.

The production database already contains the Glow Card tables and the delivery-discount field. The read-only overnight integrity audit found no invalid cycles, duplicate order points, invalid rewards or orphaned events. There is no new migration in this handover.

An isolated database lifecycle test could not be rerun on the laptop because there was no dedicated test database, Neon API key, Docker or local Postgres. Do not point destructive lifecycle tests at production.

## Validation completed

- Production build: passed, including all 119 generated pages.
- Type check: passed.
- Targeted lint: passed.
- Glow Card email tests: passed all £10, £20 and £30 boundaries, malformed input, the fourth-order example and missing-email-provider handling.
- Checkout confirmation scratch-database test: passed and removed its temporary table.
- Payment safety, offer, account, customer-segment, email-filing, message-thread, trial privacy, shop blend and remaining regression checks: passed.
- Production Glow Card schema and integrity: passed as a read-only check.
- The full suite did not produce one blanket pass because of the two sections below.

## Action still requiring a person

### Certificate records

The certificate checker found production catalogue data that must not be guessed:

- SS-31 50mg has no public test date.
- Recovery Pen Windsor Glow 50mg has no public test date.
- Certificate number `WG-WV214` is used by both Wolverine 5+5mg and Wolverine 10+10mg.
- Certificate number `WG-HG191` is used by both HGH 36 IU and HGH 100 IU.

It also warns that Retatrutide 50mg displays a 30mg certificate and the GHK-CU 100mg pen displays a 50mg certificate. Confirm the real laboratory documents before changing any of these records.

### PEARL saved-answer review

The live PEARL engine's 4,167-answer compatibility check passed, but 10 of 11 saved dashboard examples now differ from their stored snapshots. Do not accept those snapshots automatically. Review them in the PEARL dashboard and approve only changes that are factually intended.

## Desktop synchronisation

1. Inspect the desktop checkout before changing it. Commit or preserve any desktop-only work on a clearly named backup branch.
2. Fetch the remote and compare the desktop branch with `origin/main`.
3. Update the desktop to remote `main` without force-pushing or overwriting its local work.
4. Run `npm ci` in the website folder if dependencies are missing or stale. No package or lock-file change was introduced by the final audit.
5. Check the private environment names above. Never commit their values.
6. Run `npm run test:glow-card-email`, `npx tsc --noEmit`, `npm run build` and the relevant regression checks.
7. Confirm the checkout is clean before resuming desktop development.

No hard-drive transfer is needed. All important project files are in GitHub; private environment values stay outside Git.
