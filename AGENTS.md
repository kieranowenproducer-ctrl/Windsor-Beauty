<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Windsor Beauty: rules that catch people out

Read [README.md](README.md) first. The short version:

- **The shop is closed on purpose.** The holding screen (`src/lib/holdingScreen.ts`, top of
  `src/proxy.ts`) stays on until Kieran says launch. Never set `MAINTENANCE_MODE=off`, never weaken
  the gate, and never publish this branch, without his clear word.
- **Shared with Windsor Glow on Kieran's word (1 Oct 2026):** admin sign-in, Royal Mail, PayPal and
  Fena, using its own new Beauty key. **Never shared:** the database, image store, sessions or data. Never
  point this project at Windsor Glow's database. See README, "What Windsor Beauty shares".
- **Product names are sent to Royal Mail and the payment provider unchanged.** Do not bring back
  Windsor Glow's name swapping.
- **A push to `main` publishes to the live domain.** The access code for the holding screen is 1379.
- **BRIAN owns** PEARL, the AI assistant, verification logs, email marketing, ad results and tasks.
  Do not rebuild them here.
- Never invent, alter or vary a lab value or a certificate.
- Both `/api/admin/login` and `/api/account/login` accept the admin credentials. Change one, change the other.
- Products live in the database. `src/data/products.ts` is empty on purpose.
- A database address on `localhost` uses the stand-in in `src/lib/db/localClient.ts`; a hosted one uses Neon's driver.
- Never run `next build` while `next dev` is running in this folder.
- Plain English in everything a person reads, including emails and admin labels. No em dashes.
- **Colours are "Blush and Plum"** (Kieran's choice): deep cream pages, blush bands, plum buttons, no white. They are set
  once in `tailwind.config.js` by redefining the `gold`, `stone` and `white` scales. `gold-700` is plum, `white` is cream.
  Never hard-code a colour; never bring back Windsor Glow's gold on white.
- What is left to do is listed in `../CODEX-HANDOVER-2026-10-01/00-START-HERE.md`.

## Current follow-up, 1 October 2026

- Customer PayPal payment-link emails are forbidden, including automatic reminders. Keep the direct payment page, on-screen resume link and staff notice.
- Retired affiliate, referral, loyalty and old launch routes are blocked in `src/proxy.ts`. Their shared data code is retained. Do not re-enable them.
- Email colours and the holding screen read the shared Tailwind palette. Print documents and QR backgrounds use true white deliberately.
- Fena is connected and a real payment page was created. The unpaid owner-only 50p invoice INV-UZ5C7Y and order WB-UCSSFU are recorded in `docs/OWNER-50P-BANK-TEST.md`. Preserve them for Kieran's real bank check. They must never ship or send automatic emails. Fena's own paid notice is still unproved.
- Before publishing run type check, `npm run check`, production build and the relevant `test-beauty-*` checks. The PayPal test requires the private local database.
