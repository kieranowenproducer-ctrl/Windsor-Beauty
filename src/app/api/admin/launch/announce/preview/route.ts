import { getSiteContent, isDbConfigured } from '@/lib/db';
import { parseAnnouncementDrafts, renderAnnouncementHtml } from '@/lib/announcementEmail';
import { resolveMarketingSender } from '@/lib/email/marketingSender';

export const dynamic = 'force-dynamic';

// True-to-life preview of an announcement draft (task 04a236c9 revision):
// returns the EXACT HTML document that would land in a recipient's inbox
// (shared shell, logo top-centre, footer), so "Preview" opens the real email
// in a browser tab rather than showing draft text. Admin-gated by the
// /api/admin middleware like every other admin endpoint. `?sender=` mirrors
// the send flow's From choice so the preview shows the do-not-reply footer
// line exactly when the real send would carry it (task 286b1863).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const draftId = params.get('draftId') ?? '';
  const sender = resolveMarketingSender(params.get('sender'));
  const row = isDbConfigured() ? await getSiteContent('subscriber-announcement').catch(() => null) : null;
  const drafts = parseAnnouncementDrafts(row?.body);
  const draft = drafts.find((d) => d.id === draftId) ?? drafts[0];
  if (!draft) {
    return new Response('No drafts exist yet.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response(renderAnnouncementHtml(draft, sender.key), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
