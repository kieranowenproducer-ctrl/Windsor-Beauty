import { NextResponse } from 'next/server';
import {
  findMarketingContactByEmail,
  isDbConfigured,
  listOptedInMarketingContacts,
  recordMarketingCampaign,
  syncMarketingContactsFromCustomers,
} from '@/lib/db';
import { formatMarketingBody, sendMarketingEmail } from '@/lib/marketingEmail';
import { resolveMarketingSender } from '@/lib/email/marketingSender';
import { bulkSend } from '@/lib/bulkSend';
import { EMAIL_PATTERN, partitionSendableAddresses } from '@/lib/emailAddress';

export const dynamic = 'force-dynamic';

// Long enough for a 500-person send, and bulkSend stops itself before this so
// the campaign is always recorded. A campaign that dies unrecorded is how a
// whole list gets emailed twice.
export const maxDuration = 300;

// Moved to src/lib/emailAddress.ts so the "whole list" path below can use the
// same rule this one always had. The pattern itself is unchanged.
const EMAIL_RE = EMAIL_PATTERN;

// One send can never exceed this. A slip in the recipient box should cost a
// mistake, not the whole database.
const MAX_RECIPIENTS = 500;

// Sends a campaign either to every opted-in contact, or to a chosen few
// (picked from the contact list and/or typed in by hand — task ba827a09, so a
// review request can go to the people who actually just received an order
// instead of the entire list).
//
// Whoever it goes to, two rules hold:
//   - Anyone who has unsubscribed is dropped, even if their address was typed
//     in by hand. Consent lives in the database, not in the send box.
//   - Each recipient gets their own working unsubscribe link.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body?.body === 'string' ? body.body : '';
  // Which address the campaign goes out from (task 286b1863). Anything the
  // composer does not send explicitly falls back to the no-reply default.
  const sender = resolveMarketingSender(body?.sender);
  const ctaLabel = typeof body?.ctaLabel === 'string' ? body.ctaLabel.trim().slice(0, 40) || null : null;
  const ctaUrl = typeof body?.ctaUrl === 'string' ? body.ctaUrl.trim().slice(0, 500) || null : null;
  const headerLabel = typeof body?.headerLabel === 'string' ? body.headerLabel.trim().slice(0, 40) || null : null;

  if (!subject || !text.trim()) {
    return NextResponse.json({ error: 'Please provide a subject and email body.' }, { status: 400 });
  }

  const audience = body?.audience === 'custom' ? 'custom' : 'all';

  // Put the two lists back in step before working out who this goes to (task
  // 99476dc9). Customers who ticked the marketing box had no contact row and
  // so no unsubscribe token, which meant the send silently dropped them —
  // they were named in "skipped" and never written to. This gives them the
  // row and the token their recorded consent always implied. It only ever
  // adds people whose own account says yes, and never re-subscribes anyone.
  await syncMarketingContactsFromCustomers().catch(() => {});

  // Build the recipient list as { email, unsubscribeUrl } pairs.
  let recipients: { email: string; unsubscribeUrl: string }[];
  let skippedUnsubscribed: string[] = [];
  let skippedUnknown: string[] = [];
  let skippedInvalid: string[] = [];

  if (audience === 'custom') {
    const raw = Array.isArray(body?.emails) ? body.emails : [];
    const wanted = Array.from(new Set<string>(
      raw.map((e: unknown) => String(e).trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e))
    ));
    if (!wanted.length) {
      return NextResponse.json({ error: 'No valid email addresses in the selection.' }, { status: 400 });
    }
    if (wanted.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `That is ${wanted.length} people. The safety limit for one send is ${MAX_RECIPIENTS}.` },
        { status: 400 }
      );
    }

    recipients = [];
    for (const email of wanted) {
      const contact = await findMarketingContactByEmail(email).catch(() => null);
      // Somebody who opted out stays opted out, whoever typed their address.
      if (contact && (contact.unsubscribed_at || !contact.consent)) {
        skippedUnsubscribed.push(email);
        continue;
      }
      // No contact row means no unsubscribe token can exist for them, so
      // there is no lawful one-click way out of the mail. Rather than send
      // bulk mail with no exit, they are skipped and named in the result.
      if (!contact?.unsubscribe_token) {
        skippedUnknown.push(email);
        continue;
      }
      recipients.push({
        email,
        unsubscribeUrl: `https://windsorglow.com/unsubscribe?token=${contact.unsubscribe_token}`,
      });
    }

    if (!recipients.length) {
      const why = skippedUnsubscribed.length
        ? 'Everyone chosen has unsubscribed.'
        : 'None of those addresses are on the contact list, so there is no way for them to unsubscribe.';
      return NextResponse.json({ error: `Nobody can be emailed. ${why}` }, { status: 400 });
    }
  } else {
    const contacts = await listOptedInMarketingContacts();
    if (!contacts.length) {
      return NextResponse.json({ error: 'There are no opted-in contacts to send to.' }, { status: 400 });
    }
    // The chosen-selection path above has always checked the address format.
    // This one did not: it used the stored list exactly as it stood, so one bad
    // row failed on every campaign forever and lit the red banner each time.
    // Skipped rather than sent and failed, and named in the result so a real
    // address that is somehow malformed is visible instead of silently dropped.
    const usable = partitionSendableAddresses(contacts, (c) => c.email);
    skippedInvalid = usable.unsendable;
    if (!usable.sendable.length) {
      return NextResponse.json(
        { error: 'None of the contacts on the list have a usable email address.' },
        { status: 400 }
      );
    }
    recipients = usable.sendable.map((contact) => ({
      email: contact.email,
      unsubscribeUrl: `https://windsorglow.com/unsubscribe?token=${contact.unsubscribe_token}`,
    }));
  }

  const bodyHtml = formatMarketingBody(text);
  const urlFor = new Map(recipients.map((r) => [r.email, r.unsubscribeUrl]));

  // Paced, retried once each, and stopped cleanly before this function would be
  // killed. The bare loop that used to be here had no pacing, no retry and no
  // record until the very end: a timeout left nobody knowing who had already
  // been emailed, and pressing Send again emailed the first half twice.
  // See src/lib/bulkSend.ts.
  const result = await bulkSend(
    recipients.map((r) => r.email),
    (to) =>
      sendMarketingEmail({
        to,
        subject,
        bodyHtml,
        unsubscribeUrl: urlFor.get(to) ?? 'https://windsorglow.com/unsubscribe',
        text,
        sender: sender.key,
        ctaLabel,
        ctaUrl,
        headerLabel,
      }),
    { budgetMs: 240_000, label: `The campaign "${subject}"` }
  );

  const successCount = result.sent.length;
  const failureCount = result.failed.length;

  const campaign = await recordMarketingCampaign({
    subject,
    bodyHtml,
    // The raw text, From choice and button are stored so this campaign can be
    // loaded back into the composer and reused later (task 842923ab).
    bodyText: text,
    sender: sender.key,
    ctaLabel,
    ctaUrl,
    headerLabel,
    // Only the people actually reached. If the run stopped early, the history
    // has to show who really got it, or the next send repeats the first half.
    recipientCount: successCount + failureCount,
    successCount,
    failureCount,
  });

  return NextResponse.json({
    success: true,
    audience,
    recipientCount: successCount + failureCount,
    successCount,
    failureCount,
    stoppedEarly: result.stoppedEarly,
    skippedUnsubscribed,
    skippedUnknown,
    skippedInvalid,
    campaignId: campaign?.id ?? null,
    sender: sender.key,
    sentFrom: sender.address,
  });
}
