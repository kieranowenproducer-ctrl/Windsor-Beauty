# Windsor Glow — the by-hand test plan

The machine checks (`npm run check` and the `test:` scripts listed in the README's command
table) cover the logic. They cannot open a browser, click a button, or read an email. This page covers what
a person has to check.

**When to use it:** before any deploy that touches checkout, accounts, email or the admin
area. For a small text change, the machine checks are enough.

**How to use it:** work down the list, tick as you go, and write the date at the top of
your copy. Anything that fails is a blocker until it is fixed or written down as a known
problem.

---

## Before you start

- [ ] `npm run check`: every check green
- [ ] The `test:` scripts (see the README's command table): all green
- [ ] `npx tsc --noEmit` — no output means no problems
- [ ] `npm run build` completes

---

## 1. A visitor who is not logged in

Do this on a phone **and** on a computer. Use a private/incognito window so you are
genuinely logged out.

| # | Check | Expected |
|---|---|---|
| 1.1 | Open the home page | Loads, nothing broken, no error box |
| 1.2 | Open the shop | Products show with photos and prices |
| 1.3 | Use the category menu | Each category shows only its own products |
| 1.4 | Open one product | Photo, price, strengths, description, certificate all show |
| 1.5 | Change the strength dropdown | Price updates to match |
| 1.6 | Add to basket | Basket count goes up, drawer opens |
| 1.7 | Change quantity in the basket | Total recalculates correctly |
| 1.8 | Remove an item | It goes, total recalculates |
| 1.9 | Go to checkout | Address form appears |
| 1.10 | Submit checkout with the form empty | It refuses politely, does not crash |
| 1.11 | Enter a delivery address | Delivery options and prices appear |
| 1.12 | Enter a bad discount code | Clear refusal message, order still works |
| 1.13 | Try `/admin` | Sent to the login page, no admin content visible |
| 1.14 | Try `/account` | Sent to the login page |
| 1.15 | Open a made-up product address | A proper "not found" page, not an error |
| 1.16 | Use the search / filters | Results make sense; no results shows a message |
| 1.17 | Open the blog and one post | Both load |
| 1.18 | Open the dosage calculator | Works, numbers come out sensible |
| 1.19 | Every footer link | All open, none 404 |
| 1.20 | Browser console (F12) | No red errors |

---

## 2. A customer with an account

| # | Check | Expected |
|---|---|---|
| 2.1 | Register a new account | Accepted (remember: "where you heard about us" is required) |
| 2.2 | Check the inbox | Verification email arrives, link works |
| 2.3 | Log in | Lands on the account page |
| 2.4 | Look at order history | Past orders show, or a friendly empty message |
| 2.5 | Change your details and save | Saves, and is still saved after a refresh |
| 2.6 | Log out, then use "forgot password" | Reset email arrives, link works, new password works |
| 2.7 | Log in on a second device | Both stay logged in |
| 2.8 | Try to open another customer's order by changing the address bar | Refused |

---

## 3. Buying something (the money path)

Use **sandbox** payment settings unless you are deliberately testing live.

| # | Check | Expected |
|---|---|---|
| 3.1 | Complete a Pay by Bank order | Reaches the payment page |
| 3.2 | Pay successfully | Comes back to a confirmation page with an order number |
| 3.3 | Check the customer's inbox | Order confirmation email arrives, details correct |
| 3.4 | Check the business inbox | New-order alert arrives |
| 3.5 | Admin → Orders | The order is there, marked paid |
| 3.6 | Stock level on that product | Has come down by the right amount |
| 3.7 | Start an order and cancel the payment | Cancelled page, no charge, no false confirmation |
| 3.8 | Order over the free-delivery threshold | Delivery shows as free |
| 3.9 | Use a valid discount code | Correct amount comes off |
| 3.10 | **Tamper test:** change a price in the browser tools, then order | The order is priced correctly from the server, not from what you changed |

---

## 4. The admin area

Log in at `/admin`.

| # | Check | Expected |
|---|---|---|
| 4.1 | Dashboard | Figures load, nothing blank or broken |
| 4.2 | Orders → open one | Full detail shows |
| 4.3 | Mark an order paid by hand | Status changes, and is still changed after refresh |
| 4.4 | Mark an order dispatched with a tracking number | Status changes; dispatch email arrives |
| 4.5 | Products → change a price → save | New price shows on the public product page |
| 4.6 | Products → hide a product | It disappears from the shop |
| 4.7 | Upload a product photo | Uploads and appears |
| 4.8 | Try uploading a huge file, and a non-image | Both refused with a clear message |
| 4.9 | Categories → add, rename, reorder | Public category pages follow |
| 4.10 | Customers → open one | Their orders and spend show |
| 4.11 | Discount codes → create one → use it | It works at checkout |
| 4.12 | Marketing → preview a campaign | Preview shows; **do not press send** unless testing on purpose |
| 4.13 | Dispatch → export the CSV | Downloads and opens in a spreadsheet |
| 4.14 | Every left-hand menu item | Opens, none errors |
| 4.15 | The admin area on a phone | Usable — readable, buttons tappable |

---

## 5. Safety checks

| # | Check | Expected |
|---|---|---|
| 5.1 | Log out, then try `/admin/orders` | Refused |
| 5.2 | Log out, then open `/api/admin/orders` in the address bar | 401, no data |
| 5.3 | Log in as a customer, then try `/admin` | Refused |
| 5.4 | Look up an order with the right number but the wrong email | Refused |
| 5.5 | Submit the contact form 10 times quickly | Slowed or refused after a few (spam brake) |
| 5.6 | Look at the page source of any public page | No passwords, keys or database addresses |

---

## 6. Appearance

Check at phone width (390px) and on a computer.

| # | Check | Expected |
|---|---|---|
| 6.1 | Nothing overflows sideways on a phone | No horizontal scrolling |
| 6.2 | Tap targets on a phone | Big enough to hit comfortably |
| 6.3 | Images | Sharp, right shape, not stretched |
| 6.4 | Tab through a page with the keyboard | You can always see where you are |
| 6.5 | No em dashes or en dashes in customer-facing text | House rule |
| 6.6 | Prices, dates and delivery windows | Consistent everywhere they appear |

---

## 7. When something is unplugged

| # | Check | Expected |
|---|---|---|
| 7.1 | Put a wrong Fena key in and try to pay | Clear message, no crash, no false "paid" |
| 7.2 | Put a wrong email key in and place an order | The order still saves; the failure is recorded |
| 7.3 | Throttle to slow 3G in the browser tools | The site is slow but usable, and shows it is loading |

---

## After a deploy

- [ ] Home page, shop and one product page all load on the live site
- [ ] `npm run check:seo:live` passes
- [ ] Place one real small order end to end, or confirm one arrives naturally
- [ ] Watch the Vercel logs for the first hour
- [ ] **Confirm the live site is running your commit** — a multi-commit push can silently
      cancel the build and leave the old code live with everything looking green

---

## Recording the result

| Date | Who | Version / commit | Result | Notes |
|---|---|---|---|---|
| | | | | |
