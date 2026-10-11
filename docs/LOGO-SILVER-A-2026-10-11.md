# Windsor Beauty selected silver logo, 11 October 2026

> **Purpose:** Record Kieran's selected logo finish and its release scope.
> **Status:** Owner-approved release; production metadata is recorded in the workspace evidence supplement.
> **Related projects:** Windsor Beauty.
> **Dependencies:** Existing site palette, layout and original logo dimensions.
> **Key decisions:** Use the exact slightly darker brushed-silver A concept in the header and homepage. Keep the footer's pewter logo.
> **Next steps:** Include local previews and evidence in the next verified hard-drive transfer.
> **Last updated:** 2026-10-11

Kieran selected the first of the new brushed-silver variants, then supplied a screenshot to confirm it. The two attempted AI transparent extractions made the silver darker and were rejected before publication. Neither extraction is used by the website.

The deployed asset is a lossless WebP conversion of the exact `02A-brushed-silver-subtle.png` concept sheet. Every decoded RGBA pixel matches the selected PNG. Source SHA256: `7adc6bd01c2386691b7c4a35d34632a6ddb435bb79e88e029b0b03ed148275e5`. Asset SHA256: `0e0a796bb90633404cb8bdee2e15b621bb7b7b5e572f5753da91bc7616647f26`.

`BeautyLogo` displays the two regions from this sheet in SVG viewports. Its colour matrix leaves RGB unchanged and converts the light preview background to transparency. This preserves the chosen finish rather than asking AI to redraw it. Edge transparency is keyed from blue-channel values; it is a browser rendering treatment, not a claim that the concept sheet contains original vector artwork.

The outer logo boxes retain their original aspect ratios and responsive sizes: header 40px high; homepage 320px wide on desktop and 256px on phone. Footer rendering and the shared palette are unchanged. No layout, content, product image, stock, price, account, payment, email or environment settings changed.

Validation: production Webpack build, TypeScript, targeted ESLint, full standard checks, retired-feature guards and email-preview checks passed. Desktop 1280px and phone 390px previews show the selected finish, no rectangular background patch and no horizontal overflow. Before/after DOM measurements show identical logo box sizes and page background colours. No account, order, payment or email was created. Live browser evidence and deployment metadata are in the workspace `logo-silver-options-2026-10-11/live/` supplement.

The workspace deploy-wiring check also found existing unrelated root/archive and Glow branch issues. Beauty's separate production repository was current against GitHub main and was checked independently. No root or Glow push was made.

For rollback, revert this logo-only release against the latest main. Do not roll the store back to an old release that removes the customer UI, hand-delivery, haircare or email fixes.
