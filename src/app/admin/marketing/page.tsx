'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
// Type-only import: the sender ADDRESSES are resolved server-side (they can
// come from env) and arrive with the contacts payload, so this client bundle
// never carries a hardcoded copy that could drift from what actually sends.
import type { MarketingSenderKey } from '@/lib/email/marketingSender';
import { useConfirm } from '@/components/admin/ConfirmProvider';

interface MarketingContact {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  customerId: number | null;
  source: string;
  consent: boolean;
  optedInAt: string;
  unsubscribedAt: string | null;
  createdAt: string;
  // TRUE = this person is on the Customers page but has no marketing record.
  // Shown here so both pages hold the same people (task 99476dc9), but never
  // tickable: nothing has been agreed and there is no unsubscribe link.
  customerOnly?: boolean;
  orderCount?: number;
}

interface MarketingCampaign {
  id: number;
  subject: string;
  // 'sent' = a real send (permanent audit record); 'draft' = saved without
  // sending, can be deleted. Either kind can be previewed, edited and reused.
  status: 'sent' | 'draft';
  // The editable text — stored at send/save time, or reconstructed from the
  // sent HTML for campaigns older than this feature (task 842923ab).
  bodyText: string;
  sender: string | null;
  // The gold button and the band above the logo. Null on campaigns written
  // before those were choosable, which means "the usual Shop Now button".
  ctaLabel: string | null;
  ctaUrl: string | null;
  headerLabel: string | null;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  sentAt: string;
}

interface SenderOption {
  key: MarketingSenderKey;
  label: string;
  address: string;
  hint: string;
}

const SOURCE_LABEL: Record<string, string> = {
  registration: 'Registration',
  account: 'Account Settings',
  discount_signup: 'Discount Popup',
  checkout: 'Checkout',
  // Both of these were showing raw, so the column read "pre_launch_signup".
  pre_launch_signup: 'Coming Soon Signup',
  customer_account: 'Customer Account',
  other: 'Other',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}

// Campaign history shows the time as well as the date (task 842923ab): every
// saved version keeps its own moment, so two edits on the same day still read
// as two distinct entries.
function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminMarketingPage() {
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<MarketingContact[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbConfigured, setDbConfigured] = useState(true);
  // Set when copying people across from the customer list did not work, so a
  // short list is never mistaken for the whole list (task 99476dc9).
  const [syncFailed, setSyncFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'subscribed' | 'unsubscribed'>('subscribed');
  const [contactActionError, setContactActionError] = useState('');

  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  // Which address this campaign goes out from. Resets to the no-reply default
  // after every send, so choosing the marketing address is always a deliberate
  // per-campaign decision (task 286b1863).
  const [senderOptions, setSenderOptions] = useState<SenderOption[]>([]);
  const [sender, setSender] = useState<MarketingSenderKey>('no-reply');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState('');
  const [sendError, setSendError] = useState('');
  const [confirmingSend, setConfirmingSend] = useState(false);

  // Reuse/edit of previous campaigns (task 842923ab). editingFrom is a note
  // only — saving or sending ALWAYS creates a new entry, never touches the
  // campaign the text was loaded from.
  const [editingFrom, setEditingFrom] = useState<MarketingCampaign | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftResult, setDraftResult] = useState('');
  const [draftError, setDraftError] = useState('');
  const [historyPreview, setHistoryPreview] = useState<{ subject: string; html: string } | null>(null);
  const [historyPreviewLoadingId, setHistoryPreviewLoadingId] = useState<number | null>(null);
  const [historyActionError, setHistoryActionError] = useState('');
  const [deletingDraftId, setDeletingDraftId] = useState<number | null>(null);

  // The gold button and the band above the logo (task ba827a09). Blank means
  // "leave it as it has always been", so an admin who ignores these three
  // boxes gets exactly the email this page produced before they existed.
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [headerLabel, setHeaderLabel] = useState('');

  // Who the campaign goes to (task ba827a09). 'all' is every opted-in contact,
  // which is what this page could only ever do before. 'custom' is the people
  // ticked in the list below plus any addresses typed in, which is what a
  // review request needs: the handful who just received an order.
  const [audience, setAudience] = useState<'all' | 'custom'>('all');
  const [pickedEmails, setPickedEmails] = useState<string[]>([]);
  const [typedEmails, setTypedEmails] = useState('');

  // Arriving from "Email these customers" on the Dashboard's Most Popular Products report
  // (task aa684446): the addresses come in on the link, already filled in, so writing to the
  // people who buy one product is one press rather than a copied list.
  //
  // Read from window.location rather than useSearchParams on purpose: this page is one big client
  // component, and useSearchParams would need a Suspense boundary around the whole of it to build.
  const [prefillNote, setPrefillNote] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('emails');
    if (!raw) return;
    const list = Array.from(new Set(
      raw.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean)
    ));
    if (!list.length) return;
    setAudience('custom');
    setTypedEmails(list.join(', '));
    const about = (params.get('about') ?? '').trim();
    setPrefillNote(
      `${list.length} ${list.length === 1 ? 'customer' : 'customers'} filled in from the Dashboard` +
      `${about ? `, everyone who has bought ${about}` : ''}. Nothing is sent until you write the email and press send.`
    );
  }, []);

  const composerPayload = () => ({
    subject,
    body: bodyText,
    sender,
    ctaLabel: ctaLabel.trim(),
    ctaUrl: ctaUrl.trim(),
    headerLabel: headerLabel.trim(),
  });

  async function saveDraft() {
    setDraftError('');
    setDraftResult('');
    setSendError('');
    setSendResult('');
    if (!subject.trim() || !bodyText.trim()) {
      setDraftError('Please provide a subject and email body before saving a draft.');
      return;
    }
    setSavingDraft(true);
    try {
      const res = await fetch('/api/admin/marketing/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(composerPayload()),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setDraftResult(`Draft saved ${formatDateTime(data?.savedAt ?? new Date().toISOString())}. It is in the history below whenever you want it.`);
        setEditingFrom(null);
        load();
      } else {
        setDraftError(data?.error || 'Could not save the draft.');
      }
    } catch {
      setDraftError('Could not save the draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  // Loads a previous campaign into the composer. Nothing happens to the
  // original: what gets sent or saved from here is always a new entry.
  function editCampaign(campaign: MarketingCampaign) {
    setSubject(campaign.subject);
    setBodyText(campaign.bodyText);
    if (campaign.sender && senderOptions.some(o => o.key === campaign.sender)) {
      setSender(campaign.sender as MarketingSenderKey);
    }
    setCtaLabel(campaign.ctaLabel ?? '');
    setCtaUrl(campaign.ctaUrl ?? '');
    setHeaderLabel(campaign.headerLabel ?? '');
    setEditingFrom(campaign);
    setDraftResult('');
    setDraftError('');
    setSendResult('');
    setSendError('');
    setPreviewHtml(null);
    setConfirmingSend(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function previewCampaign(campaign: MarketingCampaign) {
    setHistoryActionError('');
    setHistoryPreviewLoadingId(campaign.id);
    try {
      const res = await fetch(`/api/admin/marketing/campaigns/${campaign.id}/preview`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.html) {
        setHistoryPreview({ subject: campaign.subject, html: data.html });
      } else {
        setHistoryActionError(data?.error || 'Could not load the preview.');
      }
    } catch {
      setHistoryActionError('Could not load the preview.');
    } finally {
      setHistoryPreviewLoadingId(null);
    }
  }

  async function deleteDraft(campaign: MarketingCampaign) {
    if (!(await confirm({
      title: `Delete the draft "${campaign.subject}"?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    setHistoryActionError('');
    setDeletingDraftId(campaign.id);
    try {
      const res = await fetch(`/api/admin/marketing/drafts/${campaign.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setHistoryActionError(data?.error || `Could not delete the draft "${campaign.subject}".`);
      }
    } catch {
      setHistoryActionError(`Could not delete the draft "${campaign.subject}".`);
    } finally {
      setDeletingDraftId(null);
    }
    load();
  }

  async function load() {
    try {
      const [contactsRes, campaignsRes] = await Promise.all([
        fetch('/api/admin/marketing/contacts'),
        fetch('/api/admin/marketing/campaigns'),
      ]);
      const contactsData = await contactsRes.json();
      const campaignsData = await campaignsRes.json();
      setDbConfigured(contactsData.dbConfigured !== false);
      setSyncFailed(contactsData.syncFailed === true);
      setContacts(Array.isArray(contactsData.contacts) ? contactsData.contacts : []);
      // Only the option list is refreshed here. load() also runs after
      // unsubscribing or deleting a contact, and flipping the From address out
      // from under a half-written campaign is exactly the surprise to avoid —
      // the selection resets to no-reply after a send instead (see handleSend).
      if (Array.isArray(contactsData.senderOptions)) setSenderOptions(contactsData.senderOptions);
      setCampaigns(Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Everyone who can lawfully be emailed. customerOnly people are on the
  // Customers page but have no marketing record, so they are never in here.
  const optedIn = contacts.filter(c => c.consent && !c.unsubscribedAt && !c.customerOnly);
  const notOnList = contacts.filter(c => c.customerOnly).length;

  // The people this send will actually go to when "only the people I choose"
  // is on: the ones ticked, plus anything typed into the box, deduplicated.
  // The server checks every one of them again before a single email goes out.
  const chosenEmails = Array.from(new Set([
    ...pickedEmails,
    ...typedEmails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean),
  ]));
  const audienceCount = audience === 'custom' ? chosenEmails.length : optedIn.length;

  function togglePicked(email: string) {
    setPickedEmails(list =>
      list.includes(email) ? list.filter(e => e !== email) : [...list, email]
    );
  }

  const filtered = contacts.filter(c => {
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.toLowerCase();
    const matchesSearch =
      !search ||
      name.includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const isSubscribed = c.consent && !c.unsubscribedAt && !c.customerOnly;
    const matchesFilter =
      filter === 'all' ||
      (filter === 'subscribed' && isSubscribed) ||
      (filter === 'unsubscribed' && !isSubscribed);
    return matchesSearch && matchesFilter;
  });

  async function toggleConsent(contact: MarketingContact) {
    setContactActionError('');
    const nextConsent = !(contact.consent && !contact.unsubscribedAt);
    try {
      const res = await fetch(`/api/admin/marketing/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: nextConsent }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setContactActionError(`Could not update ${contact.email} — please try again.`);
    }
    load();
  }

  async function removeContact(contact: MarketingContact) {
    if (!(await confirm({
      title: `Remove ${contact.email} from the marketing list?`,
      body: 'This is permanent and cannot be undone.',
      confirmLabel: 'Yes, remove them',
      cancelLabel: 'Keep them',
      tone: 'danger',
    }))) {
      return;
    }
    setContactActionError('');
    try {
      const res = await fetch(`/api/admin/marketing/contacts/${contact.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setContactActionError(`Could not remove ${contact.email} — please try again.`);
    }
    load();
  }

  async function handlePreview() {
    setPreviewError('');
    setPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const res = await fetch('/api/admin/marketing/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(composerPayload()),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setPreviewHtml(data?.html ?? '');
      } else {
        setPreviewError(data?.error || 'Could not generate a preview.');
      }
    } catch {
      setPreviewError('Could not generate a preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

// Starts the review step instead of sending immediately — generates a fresh
  // preview (in case subject/body changed since the last one) so the admin
  // always sees the rendered email before the final "Confirm & Send" click,
  // rather than a native confirm() dialog with no view of the actual content.
  function startSendReview() {
    setSendError('');
    setSendResult('');
    if (!subject.trim() || !bodyText.trim()) {
      setSendError('Please provide a subject and email body.');
      return;
    }
    setConfirmingSend(true);
    handlePreview();
  }

  async function handleSend() {
    setSendError('');
    setSendResult('');
    setConfirmingSend(false);

    setSending(true);
    try {
      const res = await fetch('/api/admin/marketing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...composerPayload(),
          audience,
          ...(audience === 'custom' ? { emails: chosenEmails } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        // Anyone dropped is named, not silently swallowed: "sent to 8" when
        // you picked 10 has to say what happened to the other two.
        const skipped = [
          data.skippedUnsubscribed?.length
            ? `${data.skippedUnsubscribed.length} skipped because they have unsubscribed`
            : '',
          data.skippedUnknown?.length
            ? `${data.skippedUnknown.length} skipped because they are not on the contact list, so they have no way to unsubscribe`
            : '',
          // Named, not quietly dropped. Somebody has to be able to find and
          // remove the row, or it sits on the list forever.
          data.skippedInvalid?.length
            ? `${data.skippedInvalid.length} skipped because what is stored is not a real email address (${data.skippedInvalid.slice(0, 5).join(', ')}). Remove them from the contact list below`
            : '',
        ].filter(Boolean);
        setSendResult(
          `Sent to ${data.successCount} of ${data.recipientCount} people${data.failureCount ? ` (${data.failureCount} failed)` : ''}, from ${data.sentFrom}.`
          + (skipped.length ? ` ${skipped.join('. ')}.` : '')
          + (data.stoppedEarly ? ' The run stopped early to stay inside its time limit, and only the people above were emailed. Send again to the rest.' : '')
        );
        setSubject('');
        setBodyText('');
        setPreviewHtml(null);
        setSender('no-reply');
        setCtaLabel('');
        setCtaUrl('');
        setHeaderLabel('');
        setAudience('all');
        setPickedEmails([]);
        setTypedEmails('');
        setEditingFrom(null);
        load();
      } else {
        setSendError(data?.error || 'Could not send the campaign.');
      }
    } catch {
      setSendError('Could not send the campaign.');
    } finally {
      setSending(false);
    }
  }


  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">
          <div className="mb-6">
            <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Email Marketing</h1>
            <p className="text-xs text-stone-400">
              {dbConfigured
                ? `${optedIn.length} contact${optedIn.length === 1 ? '' : 's'} opted in to receive marketing emails, out of ${contacts.length} total.`
                : 'Database not connected — marketing contacts cannot be loaded yet.'}
            </p>
          </div>

          {/* Campaign composer + preview */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
            <div className="bg-white border border-stone-200 p-5">
              <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-3">Write Campaign</p>
              {/* Reuse note (task 842923ab): the loaded campaign is only a
                  starting point — nothing can overwrite it. */}
              {editingFrom && (
                <div className="flex items-start justify-between gap-3 border border-gold-300 bg-gold-50/40 px-3 py-2.5 mb-3">
                  <p className="text-[10px] text-stone-600 leading-relaxed">
                    Editing a copy of <strong>&ldquo;{editingFrom.subject}&rdquo;</strong> ({editingFrom.status === 'draft' ? 'draft saved' : 'sent'} {formatDateTime(editingFrom.sentAt)}).
                    Sending or saving stores it as a new entry — the original stays exactly as it was.
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditingFrom(null)}
                    className="shrink-0 text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">Subject Line</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. New arrivals are here"
                    className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">Email Body</label>
                  <textarea
                    value={bodyText}
                    onChange={e => setBodyText(e.target.value)}
                    rows={10}
                    placeholder="Write your message here. Separate paragraphs with a blank line."
                    className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors resize-y"
                  />
                </div>

                {/* Which address this campaign goes out from (task 286b1863).
                    No-reply is preselected; the marketing address is a
                    deliberate opt-in for the sends you want replies to. */}
                {senderOptions.length > 0 && (
                  <div>
                    <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">Send From</label>
                    <div className="space-y-2">
                      {senderOptions.map(option => (
                        <label
                          key={option.key}
                          className={`flex gap-2.5 border px-3 py-2.5 cursor-pointer transition-colors ${
                            sender === option.key ? 'border-gold-400 bg-gold-50/40' : 'border-stone-200 hover:border-stone-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="marketing-sender"
                            checked={sender === option.key}
                            onChange={() => setSender(option.key)}
                            className="accent-gold-500 mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-xs text-stone-700">
                              {option.label} <span className="text-stone-400">({option.address})</span>
                            </span>
                            <span className="block text-[10px] text-stone-400 leading-relaxed">{option.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* The gold button and the band above the logo (task ba827a09).
                    Every campaign used to say "Shop Now" and go to the shop,
                    under a "Special Offer" band, which is wrong for anything
                    that is not selling. Left blank, all three stay exactly as
                    they have always been. */}
                <div className="border border-stone-200 p-3.5">
                  <p className="text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1">Button And Banner</p>
                  <p className="text-[10px] text-stone-400 leading-relaxed mb-3">
                    Leave these blank and the email looks as it always has: a gold{' '}
                    <span className="text-stone-500">Shop Now</span> button to the shop, under a{' '}
                    <span className="text-stone-500">Special Offer</span> banner.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">Button Words</label>
                      <input
                        type="text"
                        value={ctaLabel}
                        onChange={e => setCtaLabel(e.target.value)}
                        maxLength={40}
                        placeholder="Shop Now"
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">Button Link</label>
                      <input
                        type="url"
                        value={ctaUrl}
                        onChange={e => setCtaUrl(e.target.value)}
                        placeholder="https://windsorglow.com/shop"
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors"
                      />
                      <p className="text-[10px] text-stone-400 mt-1">
                        Must be a full web address starting with https://. Anything else falls back to the shop.
                      </p>
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">Banner Words</label>
                      <input
                        type="text"
                        value={headerLabel}
                        onChange={e => setHeaderLabel(e.target.value)}
                        maxLength={40}
                        placeholder="Special Offer"
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Who gets it (task ba827a09). This page could only ever send
                    to the whole opted-in list, so an email meant for the four
                    people who just received an order went to everybody. */}
                <div className="border border-stone-200 p-3.5">
                  <p className="text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-3">Who Gets This</p>
                  {prefillNote && (
                    <p className="text-[10px] text-gold-700 bg-gold-50 border border-gold-200 px-3 py-2 mb-3 leading-relaxed">
                      {prefillNote}
                    </p>
                  )}
                  <div className="space-y-2">
                    {([
                      { key: 'all' as const, label: `Everyone opted in (${optedIn.length})`, hint: 'The whole marketing list, as before.' },
                      { key: 'custom' as const, label: 'Only the people I choose', hint: 'Tick them in the list below, or type addresses in. Use this for anything aimed at recent buyers.' },
                    ]).map(option => (
                      <label
                        key={option.key}
                        className={`flex gap-2.5 border px-3 py-2.5 cursor-pointer transition-colors ${
                          audience === option.key ? 'border-gold-400 bg-gold-50/40' : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="marketing-audience"
                          checked={audience === option.key}
                          onChange={() => { setAudience(option.key); setConfirmingSend(false); }}
                          className="accent-gold-500 mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs text-stone-700">{option.label}</span>
                          <span className="block text-[10px] text-stone-400 leading-relaxed">{option.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {audience === 'custom' && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-400 mb-1.5">
                          Type Addresses
                        </label>
                        <textarea
                          value={typedEmails}
                          onChange={e => setTypedEmails(e.target.value)}
                          rows={3}
                          placeholder="name@example.com, someone@example.com"
                          className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors resize-y"
                        />
                        <p className="text-[10px] text-stone-400 mt-1">
                          Separate them with commas, spaces or new lines. Tick people in the contact list
                          below to add them here as well.
                        </p>
                      </div>
                      <p className="text-[10px] text-stone-500">
                        {chosenEmails.length === 0
                          ? 'Nobody chosen yet.'
                          : `${chosenEmails.length} ${chosenEmails.length === 1 ? 'person' : 'people'} chosen.`}
                        {pickedEmails.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPickedEmails([])}
                            className="ml-2 text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-stone-600 transition-colors"
                          >
                            Clear ticked
                          </button>
                        )}
                      </p>
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        Anyone who has unsubscribed is left out, whoever typed their address in, and
                        so is anyone not on the contact list, because there would be no way for them
                        to unsubscribe. You are told who was left out after the send.
                      </p>
                    </div>
                  )}
                </div>

                {sendError && <p className="text-xs text-red-500">{sendError}</p>}
                {sendResult && <p className="text-xs text-green-600">{sendResult}</p>}
                {draftError && <p className="text-xs text-red-500">{draftError}</p>}
                {draftResult && <p className="text-xs text-green-600">{draftResult}</p>}

                {confirmingSend ? (
                  <div className="border border-gold-300 bg-gold-50/40 p-4">
                    <p className="text-xs text-stone-700 mb-1">
                      Send <strong>&ldquo;{subject}&rdquo;</strong> to{' '}
                      {audience === 'custom' ? (
                        <strong>
                          the {chosenEmails.length} {chosenEmails.length === 1 ? 'person' : 'people'} you chose
                        </strong>
                      ) : (
                        <strong>all {optedIn.length} opted-in contact{optedIn.length === 1 ? '' : 's'}</strong>
                      )}
                      ?
                    </p>
                    {audience === 'custom' && chosenEmails.length <= 12 && (
                      <p className="text-[10px] text-stone-500 mb-1 break-words">{chosenEmails.join(', ')}</p>
                    )}
                    <p className="text-xs text-stone-700 mb-1">
                      It will arrive from{' '}
                      <strong>{senderOptions.find(o => o.key === sender)?.address ?? 'the no-reply address'}</strong>
                      {sender === 'no-reply' ? ', and the email tells the reader not to reply.' : ', so replies come back to that inbox.'}
                    </p>
                    <p className="text-[10px] text-stone-400 mb-3">
                      Check the rendered preview on the right before confirming. This cannot be undone once sent.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleSend}
                        disabled={sending}
                        className="text-[10px] tracking-[0.2em] uppercase bg-gold-700 text-white px-4 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                      >
                        {sending ? 'Sending…' : 'Confirm & Send'}
                      </button>
                      <button
                        onClick={() => setConfirmingSend(false)}
                        disabled={sending}
                        className="text-[10px] tracking-[0.2em] uppercase border border-stone-200 text-stone-500 px-4 py-2.5 hover:border-stone-300 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      onClick={handlePreview}
                      disabled={previewLoading || !subject.trim() || !bodyText.trim()}
                      className="text-[10px] tracking-[0.2em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {previewLoading ? 'Loading…' : 'Preview'}
                    </button>
                    <button
                      onClick={saveDraft}
                      disabled={savingDraft || !subject.trim() || !bodyText.trim()}
                      className="text-[10px] tracking-[0.2em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {savingDraft ? 'Saving…' : 'Save Draft'}
                    </button>
                    <button
                      onClick={startSendReview}
                      disabled={sending || !subject.trim() || !bodyText.trim() || audienceCount === 0}
                      className="text-[10px] tracking-[0.2em] uppercase bg-gold-700 text-white px-4 py-2.5 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed"
                    >
                      Review &amp; Send to {audienceCount} {audience === 'custom'
                        ? (audienceCount === 1 ? 'Person' : 'People')
                        : `Contact${audienceCount === 1 ? '' : 's'}`}
                    </button>
                  </div>
                )}
                {/* All three buttons above grey out together the moment the subject or the
                    message is empty, and nothing on the screen said which. */}
                {!confirmingSend && (!subject.trim() || !bodyText.trim()) && (
                  <p className="text-[10px] text-stone-400 mt-2">
                    Write a subject line and a message, then these three turn on.
                  </p>
                )}
                {!confirmingSend && subject.trim() && bodyText.trim() && audienceCount === 0 && (
                  <p className="text-[10px] text-stone-400 mt-2">
                    Nobody is chosen yet, so the send button stays off. Pick who gets this above.
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white border border-stone-200 p-5">
              <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-3">Preview</p>
              {previewError && <p className="text-xs text-red-500 mb-2">{previewError}</p>}
              {previewHtml ? (
                /* iPhones expand an embedded frame to its content's width
                   instead of shrinking it, which cut the email off at the
                   right edge (task 21fabb4e). width:1px + minWidth:100% is
                   the standard fix: the phone then lays the email out at
                   screen width, exactly like a mail app. iPhones also grow
                   the frame's height to the full email, so the wrapper
                   scrolls vertically; on desktop the frame keeps its own
                   600px scroll area and nothing changes. */
                <div
                  className="border border-stone-100"
                  style={{ maxHeight: '600px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
                >
                  <iframe
                    srcDoc={previewHtml}
                    title="Email preview"
                    style={{ height: '598px', width: '1px', minWidth: '100%', border: 0, display: 'block' }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-center border border-dashed border-stone-200">
                  <p className="text-xs text-stone-300">Write a subject and body, then click Preview to see how the email will look.</p>
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          <div className="bg-white border border-stone-200 overflow-x-auto mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-stone-100">
              <div>
                <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400">Marketing Contacts</p>
                {/* Says what this list is now, because it holds the same people
                    as the Customers page rather than a shorter separate one. */}
                <p className="text-[10px] text-stone-400 mt-1 leading-relaxed max-w-xl">
                  Everyone on the Customers page is here. {optedIn.length} can be emailed.
                  {notOnList > 0 && ` ${notOnList} did not agree to marketing emails, so they are shown as Not On List and cannot be ticked.`}
                  {' '}Click a name to open their customer record.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search contacts..."
                  className="border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-sm text-stone-700 bg-white transition-colors w-56"
                />
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value as 'all' | 'subscribed' | 'unsubscribed')}
                  className="border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-600 bg-white transition-colors"
                >
                  <option value="subscribed">Can be emailed</option>
                  <option value="unsubscribed">Cannot be emailed</option>
                  <option value="all">Everyone</option>
                </select>
              </div>
            </div>
            {contactActionError && (
              <p className="text-[11px] text-red-600 font-medium px-4 py-2 bg-red-50 border-b border-red-100">{contactActionError}</p>
            )}
            {syncFailed && (
              <p className="text-[11px] text-red-600 px-4 py-2 bg-red-50 border-b border-red-100 leading-relaxed">
                Some customers could not be brought across from the Customers page just now, so this
                list may be missing people. Reload the page. If it says this again, tell Kieran before
                sending anything.
              </p>
            )}
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  {audience === 'custom' && (
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3 w-10">Send</th>
                  )}
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Contact</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Phone</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Source</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Opted In</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Status</th>
                  <th className="text-right text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={audience === 'custom' ? 7 : 6} className="text-center text-xs text-stone-400 py-10">Loading contacts…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={audience === 'custom' ? 7 : 6} className="text-center text-xs text-stone-400 py-10">
                      {contacts.length === 0 ? 'No marketing contacts yet.' : 'No contacts match your search.'}
                    </td>
                  </tr>
                ) : filtered.map(contact => {
                  const isSubscribed = contact.consent && !contact.unsubscribedAt && !contact.customerOnly;
                  const name = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
                  return (
                    <tr key={contact.customerOnly ? `cust-${contact.customerId}` : `contact-${contact.id}`} className="border-b border-stone-50">
                      {/* Ticking somebody adds them to "only the people I
                          choose" above. Only offered for people who are still
                          opted in: an unsubscribed person is refused by the
                          server anyway, so offering the tick would be a lie. */}
                      {audience === 'custom' && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={pickedEmails.includes(contact.email)}
                            disabled={!isSubscribed}
                            onChange={() => togglePicked(contact.email)}
                            aria-label={`Send this campaign to ${contact.email}`}
                            title={
                              isSubscribed
                                ? `Send to ${contact.email}`
                                : contact.customerOnly
                                  ? 'This customer has not agreed to marketing emails'
                                  : 'This person has unsubscribed'
                            }
                            className="accent-gold-500 disabled:opacity-30"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        {/* The name comes from their customer record when the
                            marketing record has not got one, which is why this
                            column stopped being a wall of bare addresses. */}
                        <div className="text-xs text-stone-700">
                          {contact.customerId ? (
                            <Link
                              href={`/admin/customers/${contact.customerId}`}
                              className="hover:text-gold-700 transition-colors"
                            >
                              {name || contact.email}
                            </Link>
                          ) : (
                            name || '—'
                          )}
                        </div>
                        <div className="text-[9px] text-stone-400">{contact.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-600">{contact.phone || '—'}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-500">{SOURCE_LABEL[contact.source] ?? contact.source}</td>
                      <td className="px-4 py-3 text-[9px] text-stone-400">{formatDate(contact.optedInAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${isSubscribed ? 'bg-green-50 text-green-600' : 'bg-stone-100 text-stone-400'}`}>
                          {isSubscribed ? 'Opted In' : contact.customerOnly ? 'Not On List' : 'Unsubscribed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {contact.customerOnly ? (
                          /* Nothing to unsubscribe from and nothing to remove.
                             Consent for a customer is changed on the customer
                             itself, which is the one place that decides it. */
                          <Link
                            href={`/admin/customers/${contact.customerId}`}
                            className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-gold-700 transition-colors"
                          >
                            Open Customer
                          </Link>
                        ) : (
                          <>
                            <button
                              onClick={() => toggleConsent(contact)}
                              className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-gold-700 transition-colors mr-3"
                            >
                              {isSubscribed ? 'Unsubscribe' : 'Resubscribe'}
                            </button>
                            <button
                              onClick={() => removeContact(contact)}
                              className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Campaign log (task 842923ab): every previous campaign — sent or
              draft — can be previewed exactly as it looks in an inbox, loaded
              back into the composer, and reused. Edits always save as a NEW
              entry with its own date and time; nothing here is overwritten. */}
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <div className="p-4 border-b border-stone-100">
              <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-1">Campaign History</p>
              <p className="text-[10px] text-stone-400">
                Sent campaigns and saved drafts. Preview shows the email as it looks when sent; Edit &amp; Reuse loads it into the composer above — sending or saving then stores a new entry, never changing this one.
              </p>
            </div>
            {historyActionError && (
              <p className="text-[11px] text-red-600 font-medium px-4 py-2 bg-red-50 border-b border-red-100">{historyActionError}</p>
            )}
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Subject</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Status</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Recipients</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Succeeded</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Failed</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Date &amp; Time</th>
                  <th className="text-right text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-xs text-stone-400 py-10">No campaigns or drafts yet.</td>
                  </tr>
                ) : campaigns.map(c => (
                  <tr key={c.id} className="border-b border-stone-50">
                    <td className="px-4 py-3 text-xs text-stone-700">{c.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${c.status === 'draft' ? 'bg-stone-100 text-stone-500' : 'bg-green-50 text-green-600'}`}>
                        {c.status === 'draft' ? 'Draft' : 'Sent'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">{c.status === 'draft' ? '—' : c.recipientCount}</td>
                    <td className="px-4 py-3 text-xs text-green-600">{c.status === 'draft' ? '—' : c.successCount}</td>
                    <td className="px-4 py-3 text-xs text-red-500">{c.status === 'draft' ? '—' : (c.failureCount || '—')}</td>
                    <td className="px-4 py-3 text-[9px] text-stone-400 whitespace-nowrap">{formatDateTime(c.sentAt)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => previewCampaign(c)}
                        disabled={historyPreviewLoadingId === c.id}
                        className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-gold-700 transition-colors mr-3 disabled:opacity-50"
                      >
                        {historyPreviewLoadingId === c.id ? 'Loading…' : 'Preview'}
                      </button>
                      <button
                        onClick={() => editCampaign(c)}
                        className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-gold-700 transition-colors"
                      >
                        Edit &amp; Reuse
                      </button>
                      {c.status === 'draft' && (
                        <button
                          onClick={() => deleteDraft(c)}
                          disabled={deletingDraftId === c.id}
                          className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors ml-3 disabled:opacity-50"
                        >
                          {deletingDraftId === c.id ? 'Deleting…' : 'Delete'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Full-screen preview of a stored campaign, exactly as sent. */}
        {historyPreview && (
          <div
            className="fixed inset-0 z-50 bg-stone-900/60 flex items-center justify-center p-4 sm:p-8"
            onClick={() => setHistoryPreview(null)}
          >
            <div
              className="bg-white w-full max-w-3xl max-h-full flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-stone-200">
                <p className="text-xs text-stone-700 truncate">
                  <span className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mr-2">Preview</span>
                  {historyPreview.subject}
                </p>
                <button
                  onClick={() => setHistoryPreview(null)}
                  className="shrink-0 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2 hover:border-gold-400 hover:text-gold-700 transition-colors"
                >
                  Close
                </button>
              </div>
              {/* Same iPhone frame fix as the composer preview above (task
                  21fabb4e): lay the email out at screen width and let the
                  wrapper own the vertical scroll on phones. */}
              <div
                className="flex-1 overflow-y-auto"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <iframe
                  srcDoc={historyPreview.html}
                  title="Campaign preview"
                  style={{ minHeight: '70vh', height: '100%', width: '1px', minWidth: '100%', border: 0, display: 'block' }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
