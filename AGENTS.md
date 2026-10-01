<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rules that catch people out

The full list is in [README.md](README.md) under "Things that will catch you out". The short version:

- Never edit `src/components/account/ResearchDesk.tsx`. Standing rule.
- Never invent, alter or vary a lab value or a certificate.
- Both `/api/admin/login` and `/api/account/login` accept the admin credentials. Change one, change the other.
- `src/lib/costs/*` is byte-compared with the Social Engine's copy by `npm run check:costs`. Edit both or neither.
- Run `npm run check:journeys` before any change to an overlay, a modal, the header or global CSS goes live.
