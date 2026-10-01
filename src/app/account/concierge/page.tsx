import { redirect } from 'next/navigation';

// The concierge moved out of My Account and into the main navigation on
// 2026-08-04 (Kieran's request): it now lives at /concierge, which decides for
// itself what each visitor may see. This stub keeps every old link working:
// bookmarks, emails and browser history land on the new page instead of a 404.
//
// A temporary redirect on purpose, not a permanent one: browsers cache 308s
// aggressively, and this address sits behind the account-area login wall in
// middleware, so a cached permanent answer could outlive a future change.
export default function OldConciergeAddress() {
  redirect('/concierge');
}
