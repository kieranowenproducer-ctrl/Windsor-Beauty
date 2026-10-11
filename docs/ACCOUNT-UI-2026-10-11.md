# Account page clarity and signup scroll

> **Purpose:** Record Windsor Beauty's account UI corrections.
> **Status:** LIVE; release evidence is saved in the workspace account UI record.
> **Related projects:** Windsor Beauty.
> **Dependencies:** Existing true-white form surface and panel tokens.
> **Key decisions:** Preserve the approved pale blue page, pewter brand and existing account data.
> **Next steps:** Owner can refresh their existing account; hard-drive transfer of local evidence remains pending.
> **Last updated:** 2026-10-11

The sign-in page now has a full-width, bordered and underlined Create an account link with a visible keyboard focus state. The registration heading and submit button use Create an Account consistently.

Successful signup replaces a long form with a short confirmation. The old view could stay near the bottom after that replacement. The confirmation now receives keyboard focus without scrolling, resets the view before paint and repeats the reset on the next animation frame. Scroll anchoring is disabled only within the registration panel. Continue to My Account uses a fresh document request, as sign-in already does, so it includes the new session cookie and starts at the top. Already-verified registrations also use a fresh request. Verification, marketing consent, error handling and account API behaviour stay the same.

Paid Orders, Total Spent and Member Since each use the existing true-white beauty-form-panel surface with its border and light shadow. Order history and Your Details have the same white panels. The old gold-100 border and bg-white alias were pale blue and blended into the page. Order rows announce whether they are expanded, wrap on narrow screens and have a visible focus outline. The phone label is linked to its field; profile-save feedback is announced as a status.

The change touches only the three account pages. It changes no database, payment, stock, mail route, permission, holding-screen mechanism or live setting. Haircare bundle pricing and all earlier email fixes remain in the source baseline.

Validation uses a loopback-only proxy against the built app. Account/register responses and account data are fixtures, all other mutation requests are refused, database and email keys are unset, and no live account, order or email is created. Desktop checks include signup with optional marketing declined and continuation to account. Phone checks cover cards, expanding order details, no horizontal overflow, signup failure/retry and confirmation positioning. The first phone capture revealed a late scroll adjustment; that failure was retained and led to the layout-timing correction. Actual live registration is not submitted for the UI check.

TypeScript, changed-file ESLint, full project checks and production webpack build passed for the final source. The final phone confirmation settled at scrollY 0 with its heading visible and focused. Desktop confirmation and already-verified account entry also settled at scrollY 0. The workspace deployment-wiring checker reports four pre-existing workspace/Glow branch problems; Beauty's separate repository and deployment wiring pass. Do not fix or publish unrelated workspace applications for this task.

Local screenshots, preview harness and release evidence belong to the workspace account-ui-2026-10-11 folder. Code uses the existing separate Beauty GitHub repository. Hard-drive transfer is needed for local evidence; no drive copy or readiness seal is implied.
