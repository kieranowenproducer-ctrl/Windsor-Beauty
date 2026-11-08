# Beauty administrator security candidate

> **Purpose:** Record the local security-review and staff passkey changes for release review.
> **Status:** BUILT; not published or enabled
> **Related projects:** Windsor Beauty only. Glow is a read-only source reference.
> **Dependencies:** Existing Beauty administrator password, isolated Beauty database, explicit publication approval.
> **Key decisions:** All email addresses stay active. No customer passkey routes, customer blocks, discount changes, credential enrollment or paid service changes.
> **Next steps:** Owner review before publishing. Joined build and selected local comparison/decision/undo/off-state browser checks passed. Real device enrollment remains owner-operated after a separately reviewed activation.
> **Last updated:** 2026-11-08

## Security reviews

Added side-by-side customer comparisons, customer links, recorded activity and shared-connection context. Apple Private Relay information uses the existing dated reference dataset, not a new claim about every current network range. A match is evidence for a person, not proof of wrongdoing.

Ignore affects one pair only. Stop ignoring revokes that exemption and retains its history. Undoing a legitimate/shared-network decision removes only that decision's exemption, unless another resolved case still supports it. It never removes a separate ignored-pair exemption. Customer records, valid discounts and orders stay unchanged.

Review status, audit entry and exemption changes now commit together. A failed audit insert rolls everything back. The writer checks the status and millisecond-normalised timestamp the administrator reviewed. The timestamp advances monotonically, including when a note changes without a status change. The handler checks the Beauty staff cookie and the request's origin. Read-only comparison and review routes also check the Beauty staff cookie directly.

## Administrator passkeys

Off by default. `WB_ADMIN_PASSKEYS_ENABLED=true` is required, together with `WB_PASSKEY_ORIGIN` and a valid existing administrator configuration. The production origin allowed by this candidate is `https://windsorbeauty.is`; the relying-party identifier is `windsorbeauty.is`. Local testing supports `http://localhost:<port>` with relying party `localhost`. Other brands and arbitrary preview domains are refused.

Do not set these values on the live host as part of local acceptance. Before activation, install `scripts/sql/admin-passkeys-install.sql` into Beauty's database using a separately reviewed release. The installer is additive and is not run from a page request. It contains staff-only credential, challenge, audit and rate-limit tables. No member passkey schema or customer passkey endpoints are introduced.

The existing password sign-in handlers remain unchanged. Enrollment and removal require the current staff session and administrator password. Sign-in requires a verified authenticator signature, exact origin and relying party, user verification, an unexpired single-use challenge, and a current non-revoked staff credential. Duplicate credential cookies are refused. Changing administrator credentials invalidates the old passkey identity. Revoking one passkey leaves other staff passkeys valid; already-issued sessions remain subject to the existing staff-session policy. Keep the administrator password as recovery.

Two exact local dependencies were added with installation scripts disabled: `@simplewebauthn/browser` 14.0.0 and `@simplewebauthn/server` 14.0.3. No subscription or paid API is used. API conventions were checked against the [official server documentation](https://simplewebauthn.dev/docs/packages/server) and [browser documentation](https://simplewebauthn.dev/docs/packages/browser).

## Proof and limits

- `scripts/test-beauty-security-parity.mjs`: 39 actual SQL/route checks against fictional in-memory PostgreSQL. Covers comparison, forbidden access/origin, stale decisions, same-status updates, sub-millisecond timestamps, audit rollback, multiple supporting cases, ignore/re-ignore/undo and preservation of separate exemptions.
- `scripts/test-beauty-admin-passkeys.mjs`: 55 checks. Actual SQL, real signed ES256 authentication assertions and verifier; registration verification is injected. Two independent fictional staff credentials work, revoking one preserves the other, changed-password and expired/replayed challenges fail, and the additive installer reruns safely.
- Existing duplicate-account checks: 58 passed. Existing security-review advisory regression passed. Targeted lint and TypeScript checks passed at the local checkpoint; root owns the final joined build.
- Receipts: `.local-evidence/security-parity-20261108/REVIEW-RECEIPT.json` and `PASSKEY-RECEIPT.json`.

No live database, real customer, provider email or physical authenticator was used. In-memory tests do not prove independent hosted concurrent-session behaviour or physical iPhone enrollment. The browser acceptance and those limits must be included in the final release review.

**Hard-drive transfer needed** for unpublished source and local evidence.
