# Windsor Glow inbound email tracking

> **Purpose:** Explain how a customer's emailed reply reaches the enquiry it belongs to, and what still has to be switched on.
> **Status:** Enquiry dashboard, pop-up, contact-form alerts and reply-capture code are live. Direct mailbox capture is not configured yet.
> **Related:** Website Enquiries, `docs/OUTBOUND-EMAIL-RECORDING.md`, Resend, IONOS mailbox.
> **Dependencies:** A Full access receiving key (`RESEND_INBOUND_API_KEY` or `RESEND_API_KEY`), `RESEND_INBOUND_WEBHOOK_SECRET`, `REPLY_CAPTURE_ADDRESS`, Neon database.
> **Key decisions:** Replies return to their enquiry; new direct emails open one dashboard case. Staff receive one action alert, and no customer answer is sent automatically.
> **Next steps:** Add a dedicated receiving key, inbound domain and signed webhook, then forward both public IONOS mailboxes and run a real email-and-photo test.
> **Last updated:** 2026-09-15.

## The problem this exists to solve

Emma sent a question through the website form. It was answered from the dashboard. She pressed
Reply in her email, and the website never saw a word of what she said. The enquiry sat there
marked replied, reading as finished, while she waited for an answer to a question nobody knew she
had asked.

Kieran's words: *"my main concern is that because they're responding direct it bypasses the
dashboard."*

## Four things had to be true, and none of them were

1. Our enquiry emails carried a Reply-To of `info@windsorglow.com`, because `REPLY_CAPTURE_ADDRESS`
   was not set. The code has always preferred the capture address when that setting exists.
2. `info@windsorglow.com` is an ordinary IONOS mailbox, not an address Resend receives, so nothing
   about her reply ever reached the website.
3. `RESEND_INBOUND_WEBHOOK_SECRET` existed on preview deployments only, so the live webhook
   answered every call with "Inbound email capture is not configured".
4. Even with all of that fixed, a captured reply was filed under the customer's email history and
   never touched the enquiry. The person answering the enquiry is looking at the enquiry page, not
   at a customer record, so it would still have been invisible where it mattered.

Items 1 to 3 are settings. Item 4 was missing code, and it was the half that mattered: turning the
settings on without it would have left the dashboard just as blind.

## What happens now when a reply arrives

1. Resend receives the email and calls `/api/webhooks/resend-inbound`. An unsigned or mis-signed
   call is refused.
2. The reply is stored in the customer's email history, exactly as before.
3. A genuine reply must carry reply headers and be addressed to the capture mailbox. Then the
   enquiry it is answering is found from the sender's address. An open conversation wins,
   newest first. A conversation closed in the last 60 days is reopened rather than lost. Beyond
   that the email is treated as a new subject and nothing is guessed.
4. The reply is written onto that enquiry, marked as the customer's, and the enquiry goes back to
   waiting for an answer, even if it had been closed.
5. The original mailbox still has the message. The repair sends one short action alert to sales, info and
   any addresses in `ENQUIRY_ALERT_TO`; a retry sends none.
6. The automatic draft on that enquiry answers their **latest** message, not the original question
   somebody has already replied to, and says so on the draft.

Writing twice is impossible rather than unlikely. Resend retries a webhook it did not hear back
from, and the provider's message id carries a unique index, so a retry collides instead of
duplicating.

## When it arrives outside all of that

`info@windsorglow.com` is printed on the contact page, so people will always write to it directly.
After both public mailboxes forward customer mail to the receiving address, those first emails
also open their own Website Enquiries cases. Until live forwarding is set up, the manual option
below is a fallback for a message that reached the mailbox but not the dashboard.
Every enquiry has a link reading **"They replied to our inbox instead. Add it here"**. Paste in
what they wrote and it goes on the thread and puts the enquiry back in the queue. Nothing is
emailed to anyone by that button, and their address is taken from the enquiry record rather than
typed, so it cannot put words in somebody's mouth.

## What is still owed, and what each one does

Kieran approved the full repair. These account settings remain open because the available Resend
key can send only, Vercel's production receiving fields are absent, and the inbound subdomain has
no MX record. Neither IONOS forwarding rule can be verified through the available account access.

1. **`RESEND_INBOUND_WEBHOOK_SECRET` on production.** It is currently on preview only. Copy the
   same signing secret from the Resend webhook onto the production environment. Until this is
   there, the live webhook refuses every call and no reply is ever captured.
   **Receiving API key on production.** The local `RESEND_API_KEY` has Sending access only and
   cannot read received mail. Set `RESEND_INBOUND_API_KEY` to a separate Full access key if
   production uses the same restricted sending key. Keep it only in environment settings.
2. **`REPLY_CAPTURE_ADDRESS` on production**, set to a working receiving address after Resend's
   inbound domain and MX record exist. Our enquiry emails then ask people to reply there, and a customer
   pressing Reply is captured with no further thought. A short staff action alert tells the team
   to open its dashboard case, and the original mailbox rule should retain its original copy.
3. **Forwarding rules on the IONOS `info@windsorglow.com` and `sales@windsorglow.com` mailboxes**,
   copying incoming customer mail to the receiving address. These catch messages typed directly
   to either public address. The original mail stays in the IONOS mailbox. Confirm that the
   forwarded message preserves the customer's sender and attachments in a controlled test.

Setting 1 alone captures nothing on its own. Settings 1 and 2 together cover everybody who presses
Reply, which is the case that lost Emma's question. Adding 3 covers everybody else.

## The 15 September repair

The earlier code deliberately left first-contact emails out of Website Enquiries. That excluded
Adam's wrong-item message to `sales@` even if the receiving settings were switched on. The repair
opens a new dashboard case for each new direct email, links any order number it finds, flags wrong
shipments and money problems as urgent, and lets staff download its attachments through an admin-only
link. A reply to a captured dashboard thread stays on that thread. Resend's received-email id keeps
retries from opening a second case or sending another action alert. The dashboard and admin menu
refresh waiting counts while visible and show an error if those counts cannot be checked.

The original IONOS message is kept. The repair does not forward a full second copy back to sales or
send a customer response. The contact form now sends one staff notice to sales and info;
`ENQUIRY_ALERT_TO` can include more named colleagues in that same notice. Assistant handovers also alert
sales and info once when a real new case is opened. Messages from outside Windsor Glow are high
priority by default; wrong-item and refund messages are urgent. The admin panel shows a pop-up
for a new waiting enquiry. Its X confirms staff saw the note, and its Open enquiries button goes
straight to the case list. Closing the note never marks the case answered. Any failed staff alert is recorded
on System Health, while the dashboard case remains available.

The code went live on 15 September and a labelled form enquiry created a high-priority case,
raised the admin count, sent a sales/info notice, and was removed after testing. The pop-up's X,
reload memory, new-alert reopening and direct link passed a real-browser check locally. Before
calling direct mailbox capture fixed for real customers, add the Resend receiving key, webhook
secret and reply address in production, confirm both IONOS forwarding rules,
and send a controlled message with a photo to each public mailbox. Check one dashboard case, one
staff action alert, the attachment download, a reply on the same case and no duplicate on webhook retry.

Until those account settings are connected, the admin Website Enquiries page has an **Add an email
we received** form. A colleague can copy a message from sales or info, set Urgent when needed,
and put it in the same queue. That action sends the short staff alert but does not send a customer
reply. Adam's reported wrong-item order WG-W7YMWM was added as urgent case #21 on production;
the staff alert was accepted and the urgent pop-up was seen in a live browser check. Staff must
review the existing sales conversation and resolve the shipment with him.
