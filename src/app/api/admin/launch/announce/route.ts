import { NextResponse } from 'next/server';
import {
  getSiteContent,
  upsertSiteContent,
  isDbConfigured,
  listLaunchSubscribers,
  listCustomersWithStats,
} from '@/lib/db';
import { recordAnnouncementCampaign, listAnnouncementCampaigns } from '@/lib/db/marketing';
import {
  parseAnnouncementDrafts,
  sendAnnouncementEmail,
  type AnnouncementDraft,
} from '@/lib/announcementEmail';
import { MARKETING_SENDER_OPTIONS, resolveMarketingSender } from '@/lib/email/marketingSender';
import { bulkSend } from '@/lib/bulkSend';
import { EMAIL_PATTERN } from '@/lib/emailAddress';

export const dynamic = 'force-dynamic';
// The send budget below is 240 seconds; this keeps the platform from killing the function
// before bulkSend can return and the campaign row can be written. A campaign that dies
// unrecorded is how a whole list gets emailed twice.
export const maxDuration = 300;

// Subscriber announcement campaign manager (task 04a236c9, incl. Samuel's
// revision): multiple saved drafts (editable/deletable/reusable), true HTML
// preview (see ./preview), three audiences (all subscribers, picked from the
// database, manually typed addresses), and an audit trail of exactly who each
// send went to (marketing_campaigns.recipients).

const DRAFTS_KEY = 'subscriber-announcement';

async function loadDrafts(): Promise<AnnouncementDraft[]> {
  const row = await getSiteContent(DRAFTS_KEY).catch(() => null);
  return parseAnnouncementDrafts(row?.body);
}

async function saveDrafts(drafts: AnnouncementDraft[]): Promise<void> {
  await upsertSiteContent(DRAFTS_KEY, null, JSON.stringify({ drafts }), null, 'text');
}

// Shared with the marketing send route, so the two cannot drift. Unchanged.
const EMAIL_RE = EMAIL_PATTERN;

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      drafts: parseAnnouncementDrafts(null),
      subscriberCount: 0,
      addressBook: [],
      campaigns: [],
      senderOptions: MARKETING_SENDER_OPTIONS,
    });
  }
  const [drafts, subscribers, customers, campaigns] = await Promise.all([
    loadDrafts(),
    listLaunchSubscribers().catch(() => []),
    listCustomersWithStats().catch(() => []),
    listAnnouncementCampaigns(20).catch(() => []),
  ]);
  // A deduped address book for the picker: launch subscribers + customer accounts.
  const seen = new Set<string>();
  const addressBook: { email: string; label: string }[] = [];
  for (const s of subscribers) {
    const email = String(s.email).toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    addressBook.push({ email, label: 'Subscriber' });
  }
  for (const c of customers) {
    const email = String(c.email).toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ');
    addressBook.push({ email, label: name || 'Customer' });
  }
  return NextResponse.json({
    drafts,
    subscriberCount: subscribers.length,
    addressBook,
    campaigns,
    // The two From addresses the send flow can pick between, described once in
    // lib/email/marketingSender.ts so the dashboard never hardcodes an address.
    senderOptions: MARKETING_SENDER_OPTIONS,
  });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';
  const drafts = await loadDrafts();
  // Chosen per send in the dashboard, defaulting to the unmonitored no-reply
  // address so a broadcast can never land replies in the support inbox by
  // accident (task 286b1863).
  const sender = resolveMarketingSender(body?.sender);

  if (action === 'save') {
    const incoming = body?.draft ?? {};
    const draft: AnnouncementDraft = {
      id: typeof incoming.id === 'string' && incoming.id ? incoming.id : `draft-${Date.now().toString(36)}`,
      name: String(incoming.name ?? '').trim().slice(0, 80) || 'Untitled draft',
      subject: String(incoming.subject ?? '').trim().slice(0, 200),
      headline: String(incoming.headline ?? '').trim().slice(0, 200),
      body: String(incoming.body ?? '').trim().slice(0, 8000),
      updatedAt: new Date().toISOString(),
    };
    if (!draft.subject || !draft.body) {
      return NextResponse.json({ error: 'A subject and a message are both required.' }, { status: 400 });
    }
    const next = drafts.some((d) => d.id === draft.id)
      ? drafts.map((d) => (d.id === draft.id ? draft : d))
      : [...drafts, draft];
    await saveDrafts(next);
    return NextResponse.json({ success: true, draft, drafts: next });
  }

  if (action === 'delete') {
    const draftId = typeof body?.draftId === 'string' ? body.draftId : '';
    const next = drafts.filter((d) => d.id !== draftId);
    if (next.length === drafts.length) {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    }
    await saveDrafts(next);
    return NextResponse.json({ success: true, drafts: next });
  }

  if (action === 'test') {
    const draftId = typeof body?.draftId === 'string' ? body.draftId : '';
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return NextResponse.json({ error: 'Draft not found. Save it first.' }, { status: 404 });
    const testTo = typeof body?.testTo === 'string' ? body.testTo.trim() : '';
    if (!EMAIL_RE.test(testTo)) {
      return NextResponse.json({ error: 'Enter a valid email address for the test send.' }, { status: 400 });
    }
    const sent = await sendAnnouncementEmail(testTo, draft, { subjectPrefix: '[TEST] ', sender: sender.key }).catch(() => false);
    return sent
      ? NextResponse.json({ success: true, test: true, to: testTo, sender: sender.key, sentFrom: sender.address })
      : NextResponse.json({ error: 'Test send failed. Check the marketing email key.' }, { status: 502 });
  }

  if (action === 'send') {
    const draftId = typeof body?.draftId === 'string' ? body.draftId : '';
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return NextResponse.json({ error: 'Draft not found. Save it first.' }, { status: 404 });

    // Audience: 'all-subscribers' takes the live subscriber list; 'custom'
    // takes an explicit address list (picked from the database and/or typed).
    const audience = body?.audience === 'custom' ? 'custom' : 'all-subscribers';
    let recipients: string[];
    if (audience === 'custom') {
      const raw = Array.isArray(body?.emails) ? body.emails : [];
      recipients = Array.from(new Set<string>(
        raw.map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e))
      ));
      if (!recipients.length) {
        return NextResponse.json({ error: 'No valid email addresses in the selection.' }, { status: 400 });
      }
      if (recipients.length > 500) {
        return NextResponse.json({ error: 'That is over the 500-recipient safety limit for one send.' }, { status: 400 });
      }
    } else {
      // Same rule as the typed-in list above. It was only ever applied there,
      // so one unusable row on the stored list failed on every single send.
      const subscribers = await listLaunchSubscribers();
      recipients = Array.from(new Set(
        subscribers
          .map((s) => String(s.email).trim().toLowerCase())
          .filter((e) => EMAIL_RE.test(e))
      ));
      if (!recipients.length) {
        return NextResponse.json({ error: 'There are no subscribers to send to yet.' }, { status: 400 });
      }
    }

    // Paced, retried once each, and stopped cleanly before the function would be killed. See
    // src/lib/bulkSend.ts for why the old bare loop was a double-emailing hazard.
    const result = await bulkSend(
      recipients,
      to => sendAnnouncementEmail(to, draft, { sender: sender.key }),
      { budgetMs: 240_000, label: `The announcement "${draft.subject}"` }
    );
    const successCount = result.sent.length;
    const failureCount = result.failed.length;

    // Only the people actually reached are recorded as recipients. If the run stopped early, the
    // history has to show who really got it, or the next send repeats the first half of the list.
    const campaign = await recordAnnouncementCampaign({
      subject: draft.subject,
      bodyHtml: `<p>${draft.headline}</p>`,
      recipients: [...result.sent, ...result.failed],
      successCount,
      failureCount,
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      audience,
      recipientCount: recipients.length,
      successCount,
      failureCount,
      campaignId: campaign?.id ?? null,
      sender: sender.key,
      sentFrom: sender.address,
    });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
