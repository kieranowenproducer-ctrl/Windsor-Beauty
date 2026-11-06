# Product ratings received outside the website

Written reviews remain in `reviews`, with one row per review and explicit product links. Star-only ratings use `external_product_ratings`, keyed by product, source and number of stars. Saved bucket counts replace previous totals rather than incrementing, so repeat imports do not duplicate them. No empty review cards or customer accounts are created for anonymous star-only ratings.

Product cards and product review sections combine approved written reviews and external star buckets by total star points divided by total ratings. The count appears in brackets beside the stars on shop cards and product headings, including the shampoo/conditioner bundle. The main reviews page lists the written comments and links each one to the mapped product names. Its summary and the homepage review summary retain their established written-review meaning.

Kieran authorised the 6 November2026 import and confirmed the PDF's flagged counts. The source contained201ratings:20written and181star-only, with994starpoints (4.95rounded average). The shampoo/conditioner combined34ratings belong to the existing bundle. The conditioner-specific comment is also linked to conditioner through the same review row, so it is not duplicated in site-wide review totals. Products with no supplied ratings remain unrated. Import time is stored where individual historical dates were not supplied.

The original PDF, embedded JSON/CSV, source-to-catalogue mapping, idempotent SQL, local PostgreSQL test and live verification are retained outside this public website repository in the project's `review-import-20261106` evidence folder. The public site never receives Gmail credentials or import source metadata.

Checks: local disposable PostgreSQL import run twice; all source-product totals; no fabricated blank comments or shampoo split; TypeScript; focused lint; full site checks; production build. Production release and browser evidence are in the private project handover. Access settings, customer identity, checkout, payment and notification behaviour are unchanged.
