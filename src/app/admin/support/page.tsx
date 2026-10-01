// The AI Support Inbox has moved into Website Enquiries.
//
// It used to be a second place to look: refund and cancellation approvals here, contact form
// messages one screen over, and the assistant's handovers reaching neither, because they went out
// as an email. Kieran's instruction on 2026-08-02 was one inbox, and it is right for a reason
// worth writing down: a colleague sitting down to "what needs me" should not have to remember
// which of two pages a thing landed on, and anything they have to remember they will eventually
// forget on the day it matters.
//
// So it is all at /admin/enquiries now: the contact form, the assistant's handovers, and the
// approvals that used to live here. This is a redirect rather than a deletion, because the old
// path is no longer in the sidebar but lives on in older notification emails and quite possibly in somebody's
// bookmarks, and a dead link is a worse answer than a redirect.
//
// The API this page used, /api/admin/support, is UNCHANGED and still live: the enquiries screen
// reads and writes the approvals through it.
import { redirect } from 'next/navigation';

export default function AdminSupportPage() {
  redirect('/admin/enquiries');
}
