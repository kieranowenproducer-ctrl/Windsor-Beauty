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
- **Windsor Beauty and Windsor Glow share nothing.** Never put a Windsor Glow database address,
  key, token or password in this project. Never copy data between the two.
- **BRIAN owns** PEARL, the AI assistant, verification logs, email marketing, ad results and tasks.
  Do not rebuild them here.
- Never invent, alter or vary a lab value or a certificate.
- Both `/api/admin/login` and `/api/account/login` accept the admin credentials. Change one, change the other.
- Products live in the database. `src/data/products.ts` is empty on purpose.
- A database address on `localhost` uses the stand-in in `src/lib/db/localClient.ts`; a hosted one uses Neon's driver.
- Never run `next build` while `next dev` is running in this folder.
- Plain English in everything a person reads, including emails and admin labels. No em dashes.
