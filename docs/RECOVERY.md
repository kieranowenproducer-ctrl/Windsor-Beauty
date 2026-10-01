# When something goes wrong

What to do if the live shop breaks. Written to be usable at 2am by someone who did not
build it.

**First rule: find out what is actually broken before changing anything.** Is the whole
site down, or one page? Is it the code, the database, or a service we depend on?

```bash
curl -o /dev/null -w "%{http_code}\n" https://www.windsorglow.com/
curl -o /dev/null -w "%{http_code}\n" https://www.windsorglow.com/shop
```

`200` means the site is up. Anything else, or no answer at all, means it is down.

---

## 1. A bad deploy — undoing it

**This is the fastest fix and it is almost always the right first move.** Vercel keeps
every previous version and can put one back in under a minute.

1. Go to the Vercel dashboard → the Windsor Glow project → **Deployments**.
2. Find the last deployment that was working. The list is newest first.
3. Open it → **⋯** → **Promote to Production**.
4. Reload the live site and check it.

**The one trap:** never promote or roll back to anything older than commit `0c776ce`
("launch: open the site on the clock…") while the `LAUNCH_ACCESS_CODE` setting still
exists in Vercel. Older code puts the entire public shop back behind the pre-launch
"coming soon" wall, and it will look like the site has vanished.

Undoing in git instead (slower, but leaves a record):

```bash
git revert <the bad commit>   # makes a new commit that undoes it
git push                       # Vercel rebuilds automatically
```

Prefer `revert` to `reset`. `revert` adds a correction; `reset` rewrites history and can
lose work.

---

## 2. The database

The shop's data lives in **Neon**, which takes its own continuous backups. We do not keep
our own copies, so recovery is done in the Neon dashboard.

### Getting data back

Neon keeps a rolling history and can restore the database to any moment inside that
window.

1. Log into [neon.tech](https://neon.tech) → this project.
2. **Branches** → the main branch → **Restore**.
3. Pick the time to go back to. Choose a few minutes *before* the problem started.
4. Neon makes the restore available as a separate branch first — check it looks right
   before switching the live site over.
5. Switch over by updating `DATABASE_URL` in Vercel to the restored branch's address,
   then redeploy.

**Warning before any restore:** all the databases on this Neon branch share one history: the shop, the task board, the social engine and its AI cost ledger, the concierge, and other sites' databases. Restoring the branch rewinds every one of them to that moment. So restore into a NEW branch and copy only the shop tables across, never restore the main branch in place.

**Check the retention window in the Neon dashboard before you need it.** On the free and
lower-cost plans the history is short. If it is shorter than you are comfortable with, it
is a paid setting, not a code change.

### Making your own copy, before doing something risky

```bash
npm run backup
```

That writes every table into one file under `backups/`, using the database driver the
site already uses. **Nothing to install.** It only reads, so it is safe to run against
production and safe to run with the read-only credential. Large tables are read in
batches, because the Neon HTTP driver caps a single response at 64 MB.

Take one before any bulk change to products, prices or customer records.

**The `backups/` folder is gitignored on purpose.** These files contain real names,
addresses, emails and orders. Treat one exactly as you would treat the database: do not
email it, do not put it in a shared folder, and keep it somewhere that is neither this
laptop nor Neon — because the point of it is surviving the loss of either.

**What this copy is and is not.** It is protection against losing the Neon account, or
finding its history window was shorter than you assumed. It is *not* the fastest way back
from a mistake — that is Neon's own restore, above, which you should always try first.

Putting the data back from one of these files means writing a small script to read the
JSON and insert it (the shop credential on this machine is read-only, so it needs the owner credential). If you ever need
that, say so and it gets written then, against the real shape of the problem rather than
guessed at now.

> An earlier version of this page told you to run `pg_dump` and `psql`. **Neither is
> installed on this machine**, so that advice would have failed at the worst possible
> moment. `npm run backup` replaces it.

### Rebuilding the structure from nothing

If the tables themselves are missing (not the data — the structure), the site rebuilds
them itself:

1. Log into `/admin`.
2. Dashboard → **Run Database Setup**.

That runs `ensureSchema()` in `src/lib/db/schema.ts` (also reachable from `src/lib/db.ts`). It mainly **adds** missing tables and
columns, plus a few small repeat-safe fix-ups (a customer email-verified backfill, removal of auto-migrated promotion rows, refreshed check rules and one default). It is safe to run repeatedly and safe to
run against the live database. It will not bring data back — only structure.

### An important warning about local work

Everything in this workspace shares one Neon host. The `DATABASE_URL` in the local
`.env.local` (`DATABASE_URL`) is a **read-only** account, so local work on the shop cannot damage live data. The other addresses in that file (tasks, social engine and AI costs, concierge) and `NEON_ADMIN_URL` are owner accounts that CAN write, so treat them with care. If you ever
replace it with a full-access address, you are then working directly on the live customer
database with nothing between you and it.

---

## 3. Payments stopped working

Symptoms: customers reach checkout but cannot pay, or pay and the order never shows as paid.

1. **Check Fena's own status** — the problem may not be ours.
2. **Check the settings in Vercel**: `FENA_API_KEY`, `FENA_API_SECRET` (and `FENA_WEBHOOK_SECRET` for the webhook).
3. **Check the notification password**: the webhook address registered in the Fena
   dashboard must end with `?key=<FENA_WEBHOOK_SECRET>`. If `FENA_WEBHOOK_SECRET` is
   missing in production, **every payment notification is refused** — orders will be paid
   at the bank but stay unpaid in the admin area. That refusal is deliberate: the
   alternative was accepting anonymous "mark this order paid" requests.
4. **Meanwhile, nothing is lost.** Orders exist from the moment they are placed. Staff can
   mark an order paid by hand in Admin → Orders once the bank confirms.

---

## 4. Emails stopped arriving

1. Check the Resend dashboard for failures and whether the domain is still verified.
2. Check `RESEND_API_KEY` in Vercel.
3. Failures are recorded — look in the admin area's system health section.
4. Individual emails can be re-sent from Admin → Orders → the order → "Resend".

**Be careful with marketing sends.** If a campaign fails partway through, check the send
history to see who already received it before sending again, or the first part of the list
gets it twice.

---

## 5. The whole site is down

1. **Check Vercel first** — is it a platform outage, or a failed build? A failed build
   normally leaves the previous version live, so a truly dead site usually means Vercel
   itself or DNS.
2. **Check DNS**: `nslookup www.windsorglow.com`.
3. **Check the domain and certificate have not expired.**
4. If it is a bad deploy, go to section 1.

---

## 6. Getting help

- **Hosting and deploys:** Vercel dashboard, the Windsor Glow project.
- **Database:** Neon dashboard.
- **Payments:** Fena merchant support.
- **Email:** Resend dashboard.
- **Code:** `github.com/kieranowenproducer-ctrl/Windsor-Glow`.

The daily health check (`/api/cron/sentinel`, 07:00 UTC) emails a digest of every live
site. If you have that email, it tells you what was working this morning.

---

## Keep this honest

If you ever use this page for real, write down what actually happened and fix anything here
that turned out to be wrong. A recovery guide that has never been tested is a guess.
