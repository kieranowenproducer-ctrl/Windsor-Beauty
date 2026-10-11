# Customer hand-delivery exception, 11 October 2026

Kieran authorised implementation and live publication for `angela.jones99a@gmail.com`.
The live Beauty database has one active, verified account with that email. No account details,
passwords or verification state were changed.

Her signed-in checkout offers **Hand delivered, £0.00** for a UK address and selects it by default.
She can choose the usual paid UK delivery instead. Product pricing, automatic promotions,
discount-code rules, stock and payment methods retain their existing calculations, including
the existing PayPal processing fee.

The exception is in `src/lib/handDelivery.ts`. The account API supplies only an eligibility
boolean to the browser; the order endpoint checks the signed-in, verified customer again.
Typing this email as a guest or submitting a forged shipping cost does not grant the exception.
Hand-delivered orders use the existing `hand_delivered` fulfilment type, with Royal Mail and
postal tracking emails disabled. Order confirmations and staff notices keep their existing flow.
No new database table, schema change or paid service is required.

Design read: checkout for existing skincare customers; preserve the pale blue and pewter style.
Design variance 1, motion intensity 1, visual density 5. Reuses the existing radio choices and
spacing. New copy has no em or en dashes. Phone and desktop show no sideways overflow.

Validation before release: TypeScript, targeted lint, `npm run check`, production build,
`npm run test:hand-delivery`, actual PayPal routes with temporary local PostgreSQL tables,
Fena callback regression, retired-feature guards, 15 email previews and print checks passed.
Desktop (1280px) and phone (390px) browser checks passed with isolated account/catalogue responses:
eligible choice, £0 price, default selection, paid postal alternative, non-eligible account,
payment summary and saved-profile/guest journeys. No order or payment was submitted in a browser.
The old profile browser test needed its missing cart-validation fixture added after the latest
basket access checks; its existing journeys now pass.

Deployment wiring: Windsor Beauty is on its correct `main` branch and current GitHub code.
The workspace-wide checker also reports pre-existing branch/upstream failures for the workspace
and Windsor Glow. Those repositories were not changed by this task.

The prior local icon edits were safely stashed before fast-forwarding to the current live code;
reapplying them produced a clean tree because the same artwork is already in GitHub. The safety
stash was retained. No earlier work was discarded.

Release evidence will be added after publication. Real payment settlement and physical delivery
are outside these checks.
