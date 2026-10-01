# Windsor Glow outbound email recording

> **Purpose:** Explain where staff enquiry replies are recorded.
> **Status:** Ready for deployment.
> **Related:** Website Enquiries, Resend, IONOS mailbox.
> **Dependencies:** `RESEND_API_KEY`, Neon database, IONOS `info@windsorglow.com` mailbox.
> **Key decisions:** Resend sends the email; Windsor Glow stores the reply and provider reference; IONOS receives a hidden archive copy.
> **Next steps:** Add an IONOS rule that moves archive copies into a folder named `Website sent archive` if the inbox becomes busy.
> **Last updated:** 2026-09-07.

## What happens after Send is pressed

1. Resend accepts one email addressed to the customer.
2. The same submission includes a hidden copy to `info@windsorglow.com`.
3. Windsor Glow saves the wording, time, sender and Resend reference in the enquiry.
4. The enquiry is marked replied in the same database operation as the saved reply.

The hidden copy is not shown to the customer. It arrives in the IONOS inbox because an outside email service cannot write directly into the IONOS Sent folder.

If Resend accepts the email but the database write fails, the dashboard says that the email was sent and warns staff not to send it again. The Resend reference and IONOS copy provide the recovery trail.

An authenticated admin-only repair route can add a provider-verified historical reply without sending another email. Repeating the same provider reference does not create a second record, and a closed enquiry stays closed.

## Setting

`ENQUIRY_REPLY_ARCHIVE_TO` can change the archive mailbox. If it is left blank, the site uses `info@windsorglow.com`. Set it to `off` only when the archive has deliberately been disabled.
