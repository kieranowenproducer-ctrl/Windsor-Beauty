'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import SentEmailViewer from '@/components/admin/SentEmailViewer';
import CustomerEmailComposer from '@/components/admin/CustomerEmailComposer';
import { DEFAULT_ADMIN_SENDER, type AdminSenderKey } from '@/lib/email/adminSenders';
import CustomerEditFields from '../CustomerEditFields';
import { emptyDraft, type CustomerDraft } from '../customerTypes';
import { useConfirm, type ConfirmOptions } from '@/components/admin/ConfirmProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerData {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  marketing_consent: boolean;
  instagram_profile: string | null;
  facebook_profile: string | null;
  instagram_marketing_consent: boolean;
  facebook_marketing_consent: boolean;
  phone_marketing_consent: boolean;
  referred_by: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_postcode: string | null;
  address_country: string | null;
  membership_status: string;
  account_status: string;
  email_verified: boolean;
  email_verified_at: string | null;
  discount_code: string | null;
  qr_campaign_name: string | null;
  qr_campaign_type: string | null;
  qr_partner_name: string | null;
  qr_campaign_slug: string | null;
  created_at: string;
  last_login_at: string | null;
  // Set when an admin shut this account (task 9cd55f28). Not null means banned.
  banned_at: string | null;
  banned_reason: string | null;
  banned_by: string | null;
}

interface OrderItem {
  name: string;
  qty?: number;
  quantity?: number;
  price: number | string;
}

interface OrderSummary {
  order_number: string;
  status: string;
  total: string;
  items: OrderItem[] | null;
  discount_code: string | null;
  discount_amount: string | null;
  created_at: string;
  payment_confirmed_at: string | null;
}

// What this customer buys, most-bought first (task aa684446). Built from paid orders only, so it
// answers "what do they actually buy" rather than "what have they put in a basket".
interface ProductHistoryRow {
  name: string;
  slug: string | null;
  units: number;
  orders: number;
  spend: number;
  firstBought: string | null;
  lastBought: string | null;
}

interface ProfileData {
  customer: CustomerData;
  orders: OrderSummary[];
  totalSpent: number;
  orderCount: number;
  discountCodesUsed: string[];
  verificationEmail: { lastSentAt: string | null; timesSent: number };
  productHistory?: ProductHistoryRow[];
  // 'active' = issued and still spendable, 'used' = already redeemed,
  // null = no code issued (task efa43ea1).
  discountCodeStatus?: 'active' | 'used' | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDatetime(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function displayName(c: { first_name: string | null; last_name: string | null; email: string }) {
  const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return name || c.email;
}

// This page reads the customer in database column names; the shared edit boxes
// work in the same shape the customer list uses. One place to convert.
function draftFrom(c: CustomerData): CustomerDraft {
  return {
    firstName: c.first_name ?? '',
    lastName: c.last_name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    referredBy: c.referred_by ?? '',
    addressLine1: c.address_line1 ?? '',
    addressLine2: c.address_line2 ?? '',
    addressCity: c.address_city ?? '',
    addressPostcode: c.address_postcode ?? '',
    addressCountry: c.address_country ?? '',
    marketingConsent: c.marketing_consent,
  };
}

const ORDER_STATUS_CHIP: Record<string, string> = {
  awaiting_dispatch: 'bg-sky-50 text-sky-600',
  exported:          'bg-sky-50 text-sky-600',
  dispatched:        'bg-gold-50 text-gold-700',
  delivered:         'bg-green-50 text-green-600',
  paid:              'bg-blue-50 text-blue-600',
  awaiting_payment:  'bg-orange-50 text-orange-600',
  payment_failed:    'bg-red-50 text-red-400',
  cancelled:         'bg-red-50 text-red-500',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending:           'Pending',
  awaiting_payment:  'Awaiting Payment',
  paid:              'Paid',
  processing:        'Awaiting Dispatch',
  awaiting_dispatch: 'Awaiting Dispatch',
  exported:          'Exported',
  dispatched:        'Dispatched',
  delivered:         'Delivered',
  payment_failed:    'Payment Failed',
  payment_cancelled: 'Payment Cancelled',
  cancelled:         'Cancelled',
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const confirm = useConfirm();
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resending the verification email by hand. The whole reason this exists:
  // a customer rings to say their code never came, and whoever answers can
  // fix it on the call (task 34cf57c9).
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function resendVerification() {
    setResending(true);
    setResendResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/resend-verification`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setResendResult({ ok: true, message: `Sent to ${data?.sentTo ?? 'their email address'}. They need to click the link in it.` });
        setProfile(p => (p ? { ...p, verificationEmail: { lastSentAt: new Date().toISOString(), timesSent: p.verificationEmail.timesSent + 1 } } : p));
      } else {
        setResendResult({ ok: false, message: data?.error ?? 'Could not send it. Please try again shortly.' });
      }
    } catch {
      setResendResult({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setResending(false);
    }
  }

  // The email conversation with this customer (task b2084076): messages sent
  // from the dashboard and replies captured from their own email. Before this
  // existed, both lived only in inboxes and the page had no trace of either.
  // 'draft' rows (task 72260d57) are unsent messages saved under the
  // customer — opened, edited, sent or discarded from right here.
  const [emails, setEmails] = useState<{
    id: number;
    direction: 'sent' | 'received' | 'draft';
    email: string;
    our_address: string | null;
    subject: string;
    body_text: string;
    order_ref: string | null;
    created_at: string;
  }[]>([]);
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);

  // Which half of the right column is showing (task ce308493). Orders first, because that is what
  // most people open a customer for; Emails is one press away rather than a long scroll.
  const [profileTab, setProfileTab] = useState<'activity' | 'emails'>('activity');
  // Actions on one saved email: reading the real thing, sending it again, and deleting it.
  const [viewingEmail, setViewingEmail] = useState<{ id: number; subject: string; html: string | null; text: string } | null>(null);
  const [emailBusyId, setEmailBusyId] = useState<number | null>(null);
  const [emailActionNote, setEmailActionNote] = useState('');
  const [emailActionError, setEmailActionError] = useState('');
  const [confirmDeleteEmail, setConfirmDeleteEmail] = useState<number | null>(null);
  /**
   * Sending an old email to somebody else (task ce308493, second pass).
   *
   * This used to be a browser prompt() box. Kieran could not find the feature at all, and the
   * reason is in his screenshot: he was on an iPhone, in an in-app browser, where prompt() is
   * routinely blocked outright. Pressing the button did nothing and there was no way to tell. A
   * field on the page always works, can be checked before it sends, and can be read on a phone.
   */
  const [forwardingId, setForwardingId] = useState<number | null>(null);
  const [forwardTo, setForwardTo] = useState('');
  /** Set when an old email is being edited before sending, so the composer can take a new address. */
  const [reusingFrom, setReusingFrom] = useState<string | null>(null);
  const [composerTo, setComposerTo] = useState<string | null>(null);

  /** Open the email exactly as the customer received it. */
  async function viewEmail(id: number) {
    setEmailBusyId(id); setEmailActionError(''); setEmailActionNote('');
    try {
      const res = await fetch(`/api/admin/customer-emails/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.email) throw new Error(data?.error || 'It could not be opened.');
      setViewingEmail({ id, subject: data.email.subject, html: data.email.body_html, text: data.email.body_text });
    } catch (err) {
      setEmailActionError(err instanceof Error ? err.message : 'It could not be opened.');
    } finally { setEmailBusyId(null); }
  }

  /**
   * Send a saved email again. With no address it goes back to the person it was sent to; with one
   * it goes to somebody else, which is how the same answer gets reused for the next person who
   * asks the same question.
   */
  async function sendEmailAgain(id: number, to?: string) {
    setEmailBusyId(id); setEmailActionError(''); setEmailActionNote('');
    try {
      const res = await fetch(`/api/admin/customer-emails/${id}/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(to ? { to } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.sent) throw new Error(data?.error || 'It could not be sent.');
      setEmailActionNote(`Sent again to ${data.to}.`);
      loadEmails();
    } catch (err) {
      setEmailActionError(err instanceof Error ? err.message : 'It could not be sent.');
    } finally { setEmailBusyId(null); }
  }

  /**
   * Open a saved email in the composer so it can be changed and sent (task ce308493).
   *
   * Kieran: "we should be able to edit, copy, delete, do whatever to that email and use it for
   * another member." This is that, and it is why there is still no button that rewrites the stored
   * record: the answer he wants reused gets reused, and the email the first customer was actually
   * sent still says what it said.
   */
  async function editAndSend(id: number) {
    setEmailBusyId(id); setEmailActionError(''); setEmailActionNote('');
    try {
      const res = await fetch(`/api/admin/customer-emails/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.email) throw new Error(data?.error || 'It could not be opened.');
      setComposerSubject(data.email.subject || '');
      setComposerMessage(data.email.body_text || '');
      setComposerDraftId(null);
      setComposerTo(data.email.email || c?.email || '');
      setReusingFrom(data.email.subject || null);
      setComposerOpen(true);
    } catch (err) {
      setEmailActionError(err instanceof Error ? err.message : 'It could not be opened.');
    } finally { setEmailBusyId(null); }
  }

  /** Delete a saved copy. Asked for first, because there is no undo. */
  async function deleteSavedEmail(id: number) {
    setEmailBusyId(id); setEmailActionError(''); setEmailActionNote('');
    try {
      const res = await fetch(`/api/admin/customer-emails/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.deleted) throw new Error(data?.error || 'It could not be deleted.');
      setEmailActionNote('That saved email has been deleted.');
      setConfirmDeleteEmail(null);
      if (expandedEmail === id) setExpandedEmail(null);
      loadEmails();
    } catch (err) {
      setEmailActionError(err instanceof Error ? err.message : 'It could not be deleted.');
    } finally { setEmailBusyId(null); }
  }

  function loadEmails() {
    return fetch(`/api/admin/customers/${id}/emails`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.emails)) setEmails(d.emails); })
      .catch(() => {});
  }

  // A reopened draft edits in the same composer the email-address button
  // uses; its state lives here so accidental closes never lose the text.
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSender, setComposerSender] = useState<AdminSenderKey>(DEFAULT_ADMIN_SENDER);
  const [composerSubject, setComposerSubject] = useState('');
  const [composerMessage, setComposerMessage] = useState('');
  const [composerDraftId, setComposerDraftId] = useState<number | null>(null);
  const [draftActionError, setDraftActionError] = useState('');

  function openDraft(mail: { id: number; our_address: string | null; subject: string; body_text: string }) {
    const key = mail.our_address ?? '';
    setComposerSender(key === 'sales' || key === 'support' || key === 'no-reply' ? key : DEFAULT_ADMIN_SENDER);
    setComposerSubject(mail.subject);
    setComposerMessage(mail.body_text);
    setComposerDraftId(mail.id);
    setComposerOpen(true);
  }

  async function discardDraft(mail: { id: number; subject: string }) {
    if (!(await confirm({
      title: `Discard the draft "${mail.subject || '(no subject)'}"?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, discard it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    setDraftActionError('');
    try {
      const res = await fetch(`/api/admin/customer-drafts?id=${mail.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('The draft could not be discarded. Please try again.');
      await loadEmails();
    } catch (e) {
      setDraftActionError(e instanceof Error ? e.message : 'The draft could not be discarded. Please try again.');
    }
  }

  /**
   * The on-page replacement for the two pop-ups: says what will happen, and takes the reason.
   *
   * CALLED, not used as <BanPanel />. A component declared inside another component is a brand new
   * component type on every render, so React throws the old one away and builds a fresh one each
   * time a character is typed — and the reason box would lose focus after every single letter.
   * Calling it returns the markup straight into the parent's tree, where the input keeps its place.
   */
  function banPanel(shouldBan: boolean) {
    const who = c ? displayName(c) : 'this customer';
    return (
      <div className={`mt-3 border px-4 py-3 ${shouldBan ? 'border-red-300 bg-red-50' : 'border-stone-300 bg-stone-50'}`}>
        <p className="text-[11px] text-stone-800 font-semibold mb-1">
          {shouldBan ? `Ban ${who}?` : `Let ${who} back in?`}
        </p>
        <p className="text-[10px] text-stone-600 leading-relaxed mb-2.5">
          {shouldBan
            ? 'They will be signed out and will not be able to sign in or place an order. Nothing is deleted, and you can lift it again here at any time.'
            : 'They will be able to sign in and order again.'}
        </p>
        <label htmlFor="wb-ban-reason" className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">
          {shouldBan ? 'Why are you banning them?' : 'Why are you lifting it?'}
        </label>
        <input
          id="wb-ban-reason"
          value={banReason}
          onChange={e => setBanReason(e.target.value)}
          placeholder="Staff only ever see this"
          autoComplete="off"
          className="w-full border border-stone-300 px-3 py-2 text-xs text-stone-700 focus:border-gold-700 outline-none bg-white"
        />
        <div className="flex flex-wrap gap-2 mt-2.5">
          <button
            type="button"
            onClick={() => setBanned(shouldBan, banReason)}
            disabled={banBusy}
            className={`text-[9px] tracking-[0.18em] uppercase px-4 py-2 text-white transition-colors disabled:opacity-50 ${
              shouldBan ? 'bg-red-600 hover:bg-red-700' : 'bg-gold-700 hover:bg-gold-800'
            }`}
          >
            {banBusy ? 'Working...' : shouldBan ? 'Yes, ban them' : 'Yes, let them back in'}
          </button>
          <button
            type="button"
            onClick={() => { setBanAsking(null); setBanReason(''); }}
            className="text-[9px] tracking-[0.18em] uppercase text-stone-500 px-3 py-2 hover:text-stone-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function loadProfile() {
    return fetch(`/api/admin/customers/${id}/profile`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Customer not found.' : 'Failed to load profile.');
        return r.json();
      })
      .then(d => setProfile(d.profile))
      .catch(e => setError(e.message ?? 'Something went wrong.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!id) return;
    loadProfile();
    loadEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload this customer when the id in the URL changes. loadProfile is redefined on every render, so listing it would refetch the profile in a loop.
  }, [id]);

  /* Banning and letting back in (task 9cd55f28), asked for on the page rather than in pop-up boxes
   * (task 38494f7e).
   *
   * It used to put a yes/no box and then a "why?" box in front of you. Kieran found out the hard
   * way what that costs: on an iPhone in an in-app browser those boxes never appear, the button
   * does nothing at all, and nothing on screen explains it. A blocked "why?" box reads as cancelled
   * and a blocked yes/no box reads as no, so the ban silently did not happen.
   *
   * It is still deliberately two steps. Pressing Ban opens a panel that names the person, says what
   * banning does, and asks for the reason; nothing happens until Ban is pressed there. That is the
   * same protection the pop-ups gave, in a form that exists on a phone. The reason is what makes
   * "why can this customer not get in?" answerable in six months, and staff are the only ones who
   * ever see it. */
  const [banBusy, setBanBusy] = useState(false);
  const [banResult, setBanResult] = useState<{ ok: boolean; message: string } | null>(null);
  /** Which way we are about to go, once confirmed. Null when the panel is closed. */
  const [banAsking, setBanAsking] = useState<null | boolean>(null);
  const [banReason, setBanReason] = useState('');

  async function setBanned(shouldBan: boolean, reason: string) {
    if (!c) return;
    setBanAsking(null);
    setBanReason('');

    setBanBusy(true);
    setBanResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/ban`, {
        method: shouldBan ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setBanResult({ ok: true, message: data?.message ?? 'Done.' });
        await loadProfile();
      } else {
        setBanResult({ ok: false, message: data?.error ?? 'That did not work. Please try again.' });
      }
    } catch {
      setBanResult({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setBanBusy(false);
    }
  }

  // Editing from this page (task 99476dc9). Clicking a customer's name opened
  // this page and there was no way to change anything on it: the only edit in
  // the whole admin panel was the pencil in the panel beside the list, which
  // on a phone sits below the entire table. Same fields, same save, both ways in.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedNote, setSavedNote] = useState('');

  function startEdit() {
    if (!profile?.customer) return;
    setDraft(draftFrom(profile.customer));
    setSaveError('');
    setSavedNote('');
    setEditing(true);
  }

  function setField<K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function saveCustomer() {
    if (!profile?.customer) return;
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const email = draft.email.trim();
    if (!firstName || !lastName) {
      setSaveError('Please enter both a first and last name.');
      return;
    }
    if (!email) {
      setSaveError('Please enter an email address.');
      return;
    }
    // Same beat of thought the list panel asks for: this is the address they
    // sign in with, so changing it is never a silent save.
    if (email.toLowerCase() !== profile.customer.email.toLowerCase()) {
      const ok = await confirm({
        title: "Change this member's sign-in email?",
        body: `From ${profile.customer.email} to ${email}.\n\nThis is the address they sign in with and where their order emails go.`,
        confirmLabel: 'Yes, change it',
        cancelLabel: 'Leave it as it is',
      });
      if (!ok) return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone: draft.phone,
          referredBy: draft.referredBy,
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          addressCity: draft.addressCity,
          addressPostcode: draft.addressPostcode,
          addressCountry: draft.addressCountry,
          marketingConsent: draft.marketingConsent,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(data?.error || 'Could not save these changes. Please try again.');
        return;
      }
      // Read it back from the server rather than trusting the boxes, so what
      // is on screen is what is actually stored.
      await loadProfile();
      setEditing(false);
      setSavedNote('Saved.');
    } catch {
      setSaveError('Could not reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const c = profile?.customer;

  // Confirming an email address by hand, and taking it back (task efa43ea1).
  // The card could say "not verified" and offer only "send it again", which is
  // no answer at all when the customer's provider is the thing swallowing the
  // email. Marking them confirmed here does exactly what their own click does,
  // code and all, so nobody ends up confirmed without their 10%.
  const [verifyBusy, setVerifyBusy] = useState(false);

  async function setVerified(shouldVerify: boolean) {
    if (!c) return;
    const who = displayName(c);
    const question: ConfirmOptions = shouldVerify
      ? {
          title: `Confirm ${c.email} by hand for ${who}?`,
          body: 'Do this only when you know the address is theirs. It gives them their 10% member discount straight away, the same as clicking the link in their email would.',
          confirmLabel: 'Yes, confirm them',
          cancelLabel: 'Not yet',
        }
      : {
          title: `Set ${who} back to not confirmed?`,
          body: 'They lose the confirmed badge and will be offered the verification email again. Any discount code they already have keeps working.',
          confirmLabel: 'Yes, set them back',
          cancelLabel: 'Leave them confirmed',
        };
    if (!(await confirm(question))) return;

    setVerifyBusy(true);
    setResendResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/verify-email`, {
        method: shouldVerify ? 'POST' : 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setResendResult({ ok: true, message: data?.message ?? 'Done.' });
        await loadProfile();
      } else {
        setResendResult({ ok: false, message: data?.error ?? 'That did not work. Please try again.' });
      }
    } catch {
      setResendResult({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setVerifyBusy(false);
    }
  }

  // The member discount, changeable from here (task efa43ea1). The panel beside
  // the customer list could already burn and restore a code; this page, which is
  // the one you land on from a phone, could only look at it.
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeResult, setCodeResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function setCodeStatus(action: 'used' | 'active' | 'issue') {
    if (!c) return;
    const question: ConfirmOptions =
      action === 'used'
        ? {
            title: 'Mark this code as already spent?',
            body: 'It stops working at checkout. Do this when they have had their 10% some other way.',
            confirmLabel: 'Yes, mark it spent',
            cancelLabel: 'Leave it',
          }
        : action === 'active'
          ? {
              title: 'Put this code back into use?',
              body: 'They will be able to spend it at checkout again.',
              confirmLabel: 'Yes, put it back',
              cancelLabel: 'Leave it',
            }
          : {
              title: `Issue ${displayName(c)} their 10% member code?`,
              body: 'They can spend it at checkout straight away. It is not emailed to them, so read it to them or send it yourself.',
              confirmLabel: 'Yes, issue it',
              cancelLabel: 'Not now',
            };
    if (!(await confirm(question))) return;

    setCodeBusy(true);
    setCodeResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/discount-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setCodeResult({
          ok: true,
          message:
            action === 'issue'
              ? `Issued. Their code is ${data?.code ?? 'now on this page'}.`
              : action === 'used'
                ? 'Marked as spent.'
                : 'Back in use.',
        });
        await loadProfile();
      } else {
        setCodeResult({ ok: false, message: data?.error ?? 'That did not work. Please try again.' });
      }
    } catch {
      setCodeResult({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setCodeBusy(false);
    }
  }

  // Deleting the account (task efa43ea1). The delete has existed all along on
  // the panel beside the customer list; on this page, which is where you end up
  // from a phone, there was nothing to press. Same question, same endpoint, and
  // it goes back to the list afterwards because this page no longer exists.
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function deleteAccount() {
    if (!c) return;
    const confirmed = await confirm({
      title: `Permanently delete the account for ${displayName(c)}?`,
      body: `${c.email}\n\nTheir login, sessions and membership details are removed. Past orders are kept in full and stay in your reports, they just stop being linked to an account.\n\nThis cannot be undone.`,
      confirmLabel: 'Yes, delete the account',
      cancelLabel: 'Keep the account',
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error || 'Could not delete this account. Please try again.');
        return;
      }
      // Straight back to the list: staying here would show a page for somebody
      // who is gone, and a refresh would say "customer not found".
      router.push('/admin/customers');
    } catch {
      setDeleteError('Could not reach the server. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-4 sm:p-8 overflow-clip">
        <div className="max-w-5xl">

          <Link
            href="/admin/customers"
            className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-700 transition-colors mb-6 inline-block"
          >
            &larr; All Customers
          </Link>

          {loading && (
            <p className="text-xs text-stone-500">Loading profile...</p>
          )}

          {error && (
            <div className="border border-red-100 bg-red-50/50 p-4">
              <p className="text-xs text-red-500">{error}</p>
            </div>
          )}

          {profile && c && (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg font-semibold text-stone-800 mb-0.5">{displayName(c)}</h1>
                    {!editing && (
                      <button
                        type="button"
                        onClick={startEdit}
                        className="text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors"
                      >
                        Edit Customer
                      </button>
                    )}
                    {savedNote && !editing && (
                      <span className="text-[10px] text-green-600">{savedNote}</span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">{c.email}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {/* Read before anything else on this page: it changes what every other line
                        on it means (task 9cd55f28). */}
                    {c.banned_at && (
                      <span className="inline-flex items-center text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200">
                        Banned
                      </span>
                    )}
                    {c.account_status === 'pending_password' && (
                      <span className="inline-flex items-center text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200">
                        Pending Password
                      </span>
                    )}
                    {/* Said here as well as in the card below, because this is
                        the line you read first when someone is on the phone. */}
                    {!c.email_verified && (
                      <span className="inline-flex items-center text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200">
                        Email Not Verified
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-semibold text-gold-700">&pound;{profile.totalSpent.toFixed(2)}</div>
                  <div className="text-[9px] tracking-[0.15em] uppercase text-stone-500">Lifetime Spend</div>
                </div>
              </div>

              {/* The edit form. Full width and above everything else, because
                  on a phone anything tucked into a side column is found only
                  after scrolling past the whole record. */}
              {editing && (
                <div className="bg-white border border-gold-300 p-5 mb-8">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-4">Edit Customer</p>
                  <div className="space-y-3 max-w-xl">
                    <CustomerEditFields draft={draft} setField={setField} disabled={saving} />
                    {saveError && <p className="text-[10px] text-red-500">{saveError}</p>}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={saveCustomer}
                        disabled={saving}
                        className="text-[9px] tracking-[0.18em] uppercase bg-gold-700 text-white px-4 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditing(false); setSaveError(''); }}
                        disabled={saving}
                        className="text-[9px] tracking-[0.18em] uppercase border border-stone-200 text-stone-500 px-4 py-2.5 hover:border-stone-300 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                    {/* Delete, in the edit form itself (task 62faf532). The card at the bottom
                        of the first column is still there and unchanged; this is the one you can
                        actually reach, because pressing Edit on a phone puts the form under your
                        thumb and the card several screens below it. Below Save and Cancel and
                        behind a line, so the destructive button is never the one next to Save. */}
                    <div className="border-t border-stone-100 pt-4 mt-1">
                      {deleteError && <p className="text-[10px] text-red-600 mb-2">{deleteError}</p>}
                      <button
                        type="button"
                        onClick={deleteAccount}
                        disabled={deleting || saving}
                        className="w-full sm:w-auto min-h-11 text-[9px] tracking-[0.18em] uppercase border border-red-300 text-red-600 px-4 py-2.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Delete this customer'}
                      </button>
                      <p className="text-[9px] text-stone-500 mt-2 leading-relaxed">
                        Removes them for good. Past orders are kept. There is no undo, so ban them
                        instead if you only want to shut them out.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Paid Orders',     value: String(profile.orderCount) },
                  { label: 'Account Created', value: formatDate(c.created_at) },
                  { label: 'Last Login',      value: formatDatetime(c.last_login_at) },
                  { label: 'Marketing',       value: c.marketing_consent ? 'Subscribed' : 'Not subscribed' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-stone-200 p-4">
                    <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">{label}</div>
                    <div className="text-xs font-medium text-stone-700">{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left column — contact details */}
                <div className="space-y-5">

                  {/* Email verification. First card in the column because it is
                      the question that gets asked on the phone, and the button
                      that answers it should not be hunted for. */}
                  <div className="bg-white border border-stone-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Email Verification</p>
                    {c.email_verified ? (
                      <>
                        <p className="text-xs text-green-600 font-medium">Verified</p>
                        <p className="text-[10px] text-stone-500 mt-1">
                          {c.email_verified_at ? `Confirmed ${formatDatetime(c.email_verified_at)}` : 'Confirmed'}
                        </p>
                        {resendResult && (
                          <div className={`mt-3 text-[10px] px-3 py-2 border ${resendResult.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                            {resendResult.message}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setVerified(false)}
                          disabled={verifyBusy}
                          className="mt-3 w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50"
                        >
                          {verifyBusy ? 'Working...' : 'Set back to not confirmed'}
                        </button>
                        <p className="text-[9px] text-stone-300 mt-2 leading-relaxed">
                          Only if this was confirmed by mistake. Any code they already have keeps working.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-amber-600 font-medium">Not verified yet</p>
                        <p className="text-[10px] text-stone-500 mt-1 leading-relaxed">
                          {profile.verificationEmail.lastSentAt
                            ? `Their link was last sent ${formatDatetime(profile.verificationEmail.lastSentAt)}${profile.verificationEmail.timesSent > 1 ? ` (${profile.verificationEmail.timesSent} sent in total)` : ''}. They have not clicked it, so they have no member discount yet.`
                            : 'No verification link has ever been sent to this customer.'}
                        </p>
                        {resendResult && (
                          <div className={`mt-3 text-[10px] px-3 py-2 border ${resendResult.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                            {resendResult.message}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={resendVerification}
                          disabled={resending || verifyBusy}
                          className="mt-3 w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resending ? 'Sending...' : 'Resend Verification Email'}
                        </button>
                        <p className="text-[9px] text-stone-300 mt-2 leading-relaxed">
                          Ask them to check spam and junk. Yahoo and Hotmail filter this kind of email hardest.
                        </p>
                        {/* The answer for the customer whose provider will never deliver the
                            link. Sending it again cannot fix that; confirming the address for
                            them can (task efa43ea1). */}
                        <button
                          type="button"
                          onClick={() => setVerified(true)}
                          disabled={verifyBusy || resending}
                          className="mt-3 w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:bg-gold-50 hover:border-gold-400 transition-colors disabled:opacity-50"
                        >
                          {verifyBusy ? 'Working...' : 'Confirm this email by hand'}
                        </button>
                        <p className="text-[9px] text-stone-300 mt-2 leading-relaxed">
                          Use this when you know the address is theirs and the email will not get
                          through. It gives them their 10% straight away.
                        </p>
                      </>
                    )}
                  </div>

                  {/* Contact */}
                  <div className="bg-white border border-stone-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Contact</p>
                    <div className="space-y-1.5 text-xs text-stone-600">
                      <p>{c.email}</p>
                      {c.phone ? <p>{c.phone}</p> : <p className="text-stone-300">No phone on file</p>}
                      {c.instagram_profile && <p>Instagram: {c.instagram_profile}</p>}
                      {c.facebook_profile && <p>Facebook: {c.facebook_profile}</p>}
                      <p>Email offers: {c.marketing_consent ? 'On' : 'Off'}</p>
                      <p>Instagram messages: {c.instagram_marketing_consent ? 'On' : 'Off'}</p>
                      <p>Facebook messages: {c.facebook_marketing_consent ? 'On' : 'Off'}</p>
                      <p>Telephone offers: {c.phone_marketing_consent ? 'On' : 'Off'}</p>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="bg-white border border-stone-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Address</p>
                    {c.address_line1 ? (
                      <div className="text-[10px] text-stone-600 leading-relaxed space-y-0.5">
                        <p>{c.address_line1}</p>
                        {c.address_line2 && <p>{c.address_line2}</p>}
                        <p>{c.address_city}{c.address_postcode ? `, ${c.address_postcode}` : ''}</p>
                        {c.address_country && <p>{c.address_country}</p>}
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-300">No address on file</p>
                    )}
                  </div>

                  {/* Referred by / how they heard — a required registration answer, shown
                      here as its own clear field (not just a footnote on Original Source)
                      so nothing the customer entered at sign-up is missed. */}
                  <div className="bg-white border border-stone-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Referred By</p>
                    {c.referred_by ? (
                      <p className="text-xs text-stone-700">{c.referred_by}</p>
                    ) : (
                      <p className="text-[10px] text-stone-300">Not provided</p>
                    )}
                  </div>

                  {/* Banning (task 9cd55f28). Sits with the other facts about the person rather
                      than as a stray red button, but says plainly what it does before it is
                      pressed: shut out of the shop, nothing deleted, undo here. */}
                  <div className={`border p-5 ${c.banned_at ? 'border-red-200 bg-red-50/50' : 'bg-white border-stone-200'}`}>
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Account Access</p>
                    {c.banned_at ? (
                      <>
                        <p className="text-xs text-red-700 font-semibold">Banned</p>
                        <p className="text-[10px] text-stone-600 mt-1 leading-relaxed">
                          Cannot sign in and cannot place an order, including as a guest on this email.
                        </p>
                        <p className="text-[10px] text-stone-500 mt-2">
                          Banned {formatDatetime(c.banned_at)}{c.banned_by ? ` by ${c.banned_by}` : ''}.
                        </p>
                        {c.banned_reason && (
                          <p className="text-[10px] text-stone-600 mt-1">Reason given: {c.banned_reason}</p>
                        )}
                        <button
                          type="button"
                          onClick={() => { setBanAsking(false); setBanReason(''); }}
                          disabled={banBusy}
                          className="mt-3 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50"
                        >
                          {banBusy ? 'Working...' : 'Let them back in'}
                        </button>
                        {banAsking === false && banPanel(false)}
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-stone-700">Normal</p>
                        <p className="text-[10px] text-stone-500 mt-1 leading-relaxed">
                          Banning shuts the account: no signing in, no ordering, signed out everywhere.
                          Nothing is deleted and you can undo it here.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setBanAsking(true); setBanReason(''); }}
                          disabled={banBusy}
                          className="mt-3 text-[9px] tracking-[0.18em] uppercase border border-red-300 text-red-600 px-4 py-2 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {banBusy ? 'Working...' : 'Ban this account'}
                        </button>
                        {banAsking === true && banPanel(true)}
                      </>
                    )}
                    {banResult && (
                      <p className={`text-[10px] mt-2 ${banResult.ok ? 'text-stone-600' : 'text-red-600'}`}>{banResult.message}</p>
                    )}
                  </div>

                  {/* Attribution */}
                  <div className="bg-white border border-stone-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Original Source</p>
                    {c.qr_campaign_name ? (
                      <div className="space-y-1 text-[10px]">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gold-700 shrink-0" />
                          <span className="text-xs font-medium text-stone-700">{c.qr_campaign_name}</span>
                        </div>
                        {c.qr_campaign_type && <p className="text-stone-500 uppercase tracking-wider ml-4">{c.qr_campaign_type}</p>}
                        {c.qr_partner_name && <p className="text-stone-500 ml-4">{c.qr_partner_name}</p>}
                        {c.qr_campaign_slug && <p className="font-mono text-stone-300 ml-4">/r/{c.qr_campaign_slug}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-stone-200 shrink-0" />
                        <span className="text-[10px] text-stone-500">Direct / No QR campaign</span>
                      </div>
                    )}
                  </div>

                  {/* Discount */}
                  <div className="bg-white border border-stone-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">10% Member Discount</p>
                    {c.discount_code ? (
                      <>
                        <p className="font-mono text-xs text-gold-700">{c.discount_code}</p>
                        {/* Spent or still spendable, and the switch between them. Both were on
                            the panel beside the list and neither was here (task efa43ea1). */}
                        <p className="text-[10px] text-stone-500 mt-1">
                          {profile.discountCodeStatus === 'used'
                            ? 'Already spent. It will not work at checkout.'
                            : 'Not spent yet. They can use it at checkout.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setCodeStatus(profile.discountCodeStatus === 'used' ? 'active' : 'used')}
                          disabled={codeBusy}
                          className="mt-3 w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50"
                        >
                          {codeBusy
                            ? 'Working...'
                            : profile.discountCodeStatus === 'used'
                              ? 'Put this code back into use'
                              : 'Mark this code as spent'}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-[10px] text-stone-300">Not issued</p>
                        <button
                          type="button"
                          onClick={() => setCodeStatus('issue')}
                          disabled={codeBusy}
                          className="mt-3 w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:bg-gold-50 hover:border-gold-400 transition-colors disabled:opacity-50"
                        >
                          {codeBusy ? 'Working...' : 'Issue their 10% code'}
                        </button>
                        <p className="text-[9px] text-stone-300 mt-2 leading-relaxed">
                          Gives them a code they can spend now. It is not emailed to them, so read
                          it to them or send it yourself.
                        </p>
                      </>
                    )}
                    {codeResult && (
                      <p className={`text-[10px] mt-2 ${codeResult.ok ? 'text-stone-600' : 'text-red-600'}`}>
                        {codeResult.message}
                      </p>
                    )}
                    {profile.discountCodesUsed.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">Codes Used on Orders</p>
                        <div className="flex flex-wrap gap-1">
                          {profile.discountCodesUsed.map(code => (
                            <span key={code} className="font-mono text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5">{code}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Deleting the account (task efa43ea1). Last card in the column on purpose:
                      it is the one thing on this page that cannot be undone, so it should be
                      the last thing you come to, not something a thumb meets on the way past.
                      Banning, directly above, is the reversible version of the same instinct. */}
                  <div className="bg-white border border-red-200 p-5">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-3">Delete This Account</p>
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      Removes their login, their sessions and their membership details for good.
                      Past orders are kept in full and stay in your reports, they just stop being
                      linked to an account. There is no undo, so ban them instead if you only want
                      to shut them out.
                    </p>
                    {deleteError && <p className="text-[10px] text-red-600 mt-2">{deleteError}</p>}
                    <button
                      type="button"
                      onClick={deleteAccount}
                      disabled={deleting}
                      className="mt-3 w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-red-300 text-red-600 px-4 py-2.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Delete this account'}
                    </button>
                  </div>

                </div>

                {/* Right column — orders + verification */}
                <div className="lg:col-span-2 space-y-6">

                  {/* Tabs (task ce308493). Kieran: "there must be a tab on the customer profile to
                      show emails sent." The page was one long scroll with the email history buried
                      two thirds of the way down, under the order list, which is no use when
                      somebody rings up asking what we sent them. */}
                  <div className="flex gap-1 border-b border-stone-200">
                    {([
                      ['activity', 'Orders and Activity'],
                      ['emails', `Emails (${emails.length})`],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setProfileTab(key)}
                        aria-pressed={profileTab === key}
                        className={`text-[9px] tracking-[0.18em] uppercase px-5 py-3 -mb-px border-b-2 transition-colors ${
                          profileTab === key
                            ? 'border-gold-700 text-gold-800 font-semibold'
                            : 'border-transparent text-stone-500 hover:text-stone-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {profileTab === 'activity' && (<>

                  {/* What they buy (task aa684446). Above the order history on purpose: the order
                      list answers "what happened", this answers "what do they buy", which is the
                      question you are asking when you open somebody's page before a promotion. */}
                  <div className="bg-white border border-stone-200">
                    <div className="px-5 py-4 border-b border-stone-100">
                      <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500">
                        What They Buy
                        {(profile.productHistory?.length ?? 0) > 0 && (
                          <span className="text-stone-300 ml-1">({profile.productHistory!.length} product{profile.productHistory!.length === 1 ? '' : 's'})</span>
                        )}
                      </p>
                      <p className="text-[9px] text-stone-500 mt-1">
                        Most bought first, from orders they have paid for.
                      </p>
                    </div>
                    {!profile.productHistory || profile.productHistory.length === 0 ? (
                      <p className="text-[10px] text-stone-300 px-5 py-6">
                        Nothing bought yet. This fills in as soon as an order is paid for.
                      </p>
                    ) : (
                      <>
                        <div className="px-5 py-3 bg-stone-50/60 border-b border-stone-100">
                          <p className="text-[10px] text-stone-600">
                            Buys the most:{' '}
                            <span className="font-semibold text-stone-800">{profile.productHistory[0].name}</span>
                            {' '}- {profile.productHistory[0].units} bought
                            {profile.productHistory[0].orders > 1 ? ` over ${profile.productHistory[0].orders} orders` : ''}
                            {profile.productHistory[0].lastBought ? `, last on ${formatDate(profile.productHistory[0].lastBought)}` : ''}.
                          </p>
                        </div>
                        <div className="divide-y divide-stone-50">
                          {profile.productHistory.map(row => (
                            <div key={row.slug ?? row.name} className="px-5 py-3 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs text-stone-700 truncate">{row.name}</p>
                                <p className="text-[9px] text-stone-500 mt-0.5">
                                  {row.firstBought === row.lastBought
                                    ? `Bought ${formatDate(row.lastBought)}`
                                    : `First ${formatDate(row.firstBought)}, last ${formatDate(row.lastBought)}`}
                                  {row.orders > 1 ? ` · ${row.orders} orders` : ''}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-xs font-semibold text-stone-700">{row.units} bought</p>
                                <p className="text-[9px] text-stone-500">&pound;{row.spend.toFixed(2)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Orders */}
                  <div className="bg-white border border-stone-200">
                    <div className="px-5 py-4 border-b border-stone-100">
                      <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500">
                        Orders and Payment Attempts <span className="text-stone-300 ml-1">({profile.orderCount} paid)</span>
                      </p>
                    </div>
                    {profile.orders.length === 0 ? (
                      <p className="text-[10px] text-stone-300 px-5 py-6">No orders found.</p>
                    ) : (
                      <div className="divide-y divide-stone-50">
                        {profile.orders.map(order => {
                          const chip = ORDER_STATUS_CHIP[order.status] ?? 'bg-stone-100 text-stone-500';
                          const label = ORDER_STATUS_LABEL[order.status] ?? order.status;
                          const items: OrderItem[] = Array.isArray(order.items)
                            ? order.items
                            : (typeof order.items === 'string' ? JSON.parse(order.items) : []);
                          return (
                            <div key={order.order_number} className="px-5 py-4">
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div>
                                  <Link
                                    href={`/admin/orders?search=${encodeURIComponent(order.order_number)}`}
                                    className="font-mono text-xs text-gold-700 hover:text-gold-700"
                                  >
                                    {order.order_number}
                                  </Link>
                                  <p className="text-[9px] text-stone-500 mt-0.5">{formatDate(order.created_at)}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-semibold text-stone-700">&pound;{Number(order.total).toFixed(2)}</span>
                                  <span className={`text-[8px] tracking-wider uppercase px-1.5 py-0.5 ${chip}`}>{label}</span>
                                </div>
                              </div>
                              {items.length > 0 && (
                                <div className="space-y-0.5">
                                  {items.map((item, i) => (
                                    <div key={i} className="flex justify-between text-[9px] text-stone-500">
                                      <span>{item.name} {(item.qty ?? item.quantity ?? 1) > 1 ? `x${item.qty ?? item.quantity}` : ''}</span>
                                      <span className="text-stone-500">&pound;{Number(item.price).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(order.discount_code || Number(order.discount_amount) > 0) && (
                                <p className="text-[9px] text-green-600 mt-1">
                                  Discount:{order.discount_code ? ` ${order.discount_code}` : ''}
                                  {Number(order.discount_amount) > 0 ? ` −£${Number(order.discount_amount).toFixed(2)}` : ''}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  </>)}

                  {profileTab === 'emails' && (<>

                  {/* Email history (task b2084076): the conversation itself.
                      Messages typed in the dashboard and, once reply capture
                      is on, the customer's own email replies — so "what did
                      we say to them and what did they answer" is on this
                      page instead of only in the sales inbox. */}
                  <div className="bg-white border border-stone-200">
                    <div className="px-5 py-4 border-b border-stone-100">
                      <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500">
                        Email History <span className="text-stone-300 ml-1">({emails.length})</span>
                      </p>
                    </div>
                    {draftActionError && <p className="text-[10px] text-red-600 px-5 pt-3">{draftActionError}</p>}
                    {emailActionError && <p className="text-[10px] text-red-600 px-5 pt-3">{emailActionError}</p>}
                    {emailActionNote && <p className="text-[10px] text-green-700 px-5 pt-3">{emailActionNote}</p>}
                    {emails.length === 0 ? (
                      <p className="text-[10px] text-stone-300 px-5 py-6">
                        No emails on record. Messages sent from the dashboard are saved here from now on; their replies appear once reply capture is switched on.
                      </p>
                    ) : (
                      <div className="divide-y divide-stone-50">
                        {emails.map(mail => {
                          const open = expandedEmail === mail.id;
                          return (
                            /* The summary is the expand button; the expanded
                               detail sits OUTSIDE it, because a draft's Open
                               and Discard are real buttons and buttons must
                               never nest (task 72260d57). */
                            <div key={mail.id}>
                              <button
                                type="button"
                                onClick={() => setExpandedEmail(open ? null : mail.id)}
                                className="w-full text-left px-5 py-3 hover:bg-stone-50 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className={`text-[8px] tracking-wider uppercase px-1.5 py-0.5 ${mail.direction === 'received' ? 'bg-gold-50 text-gold-700' : mail.direction === 'draft' ? 'bg-amber-50 text-amber-600' : 'bg-stone-100 text-stone-500'}`}>
                                        {mail.direction === 'received' ? 'They wrote' : mail.direction === 'draft' ? 'Draft' : 'We sent'}
                                      </span>
                                      {mail.order_ref && (
                                        <span className="font-mono text-[9px] text-gold-700">{mail.order_ref}</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] font-semibold text-stone-700 truncate">{mail.subject || '(no subject)'}</p>
                                    {!open && (
                                      <p className="text-[10px] text-stone-500 truncate">{mail.body_text}</p>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-stone-500 whitespace-nowrap shrink-0">{formatDatetime(mail.created_at)}</p>
                                </div>
                              </button>
                              {open && (
                                <div className="px-5 pb-3">
                                  <div className="border-l-2 border-gold-200 pl-3">
                                    <p className="text-[10px] text-stone-600 whitespace-pre-wrap">{mail.body_text}</p>
                                    <p className="text-[9px] text-stone-500 mt-1.5">
                                      {mail.direction === 'received'
                                        ? `From ${mail.email}`
                                        : mail.direction === 'draft'
                                          ? 'Draft - not sent yet. Open it to edit and send, or discard it.'
                                          : `Sent to ${mail.email}${mail.our_address ? ` from ${mail.our_address}` : ''}`}
                                    </p>
                                    {mail.direction === 'draft' && (
                                      <div className="flex items-center gap-2 mt-2.5">
                                        <button
                                          type="button"
                                          onClick={() => openDraft(mail)}
                                          className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:bg-gold-800 transition-colors"
                                        >
                                          Open and edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => discardDraft(mail)}
                                          className="border border-stone-300 bg-white text-stone-600 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:border-red-300 hover:text-red-600 transition-colors"
                                        >
                                          Discard
                                        </button>
                                      </div>
                                    )}

                                    {/* What you can do with an email that was actually sent
                                        (task ce308493): read the real thing, send it again to them,
                                        reuse the wording for somebody else, or delete the copy.
                                        There is deliberately no "edit" here. A record of what we
                                        sent somebody is worth nothing if it can be rewritten
                                        afterwards, because then the honest answer to "what did we
                                        tell them" becomes "whatever it says now". Reuse opens a
                                        copy instead, and the first email still says what it said. */}
                                    {mail.direction === 'sent' && (
                                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                                        <button
                                          type="button"
                                          onClick={() => viewEmail(mail.id)}
                                          disabled={emailBusyId === mail.id}
                                          className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:bg-gold-800 transition-colors disabled:opacity-40"
                                        >
                                          {emailBusyId === mail.id ? 'Working...' : 'See the email'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => sendEmailAgain(mail.id)}
                                          disabled={emailBusyId === mail.id}
                                          className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                                        >
                                          Send it again
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => editAndSend(mail.id)}
                                          disabled={emailBusyId === mail.id}
                                          className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                                        >
                                          Edit and send
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setForwardingId(forwardingId === mail.id ? null : mail.id);
                                            setForwardTo('');
                                          }}
                                          disabled={emailBusyId === mail.id}
                                          className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                                        >
                                          Send to someone else
                                        </button>
                                        {confirmDeleteEmail === mail.id ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => deleteSavedEmail(mail.id)}
                                              disabled={emailBusyId === mail.id}
                                              className="bg-red-600 text-white text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:bg-red-700 transition-colors disabled:opacity-40"
                                            >
                                              Delete for good
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setConfirmDeleteEmail(null)}
                                              className="text-[9px] tracking-[0.14em] uppercase text-stone-500 px-2 py-2 hover:text-stone-700"
                                            >
                                              Keep it
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteEmail(mail.id)}
                                            className="border border-stone-300 bg-white text-stone-600 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2 hover:border-red-300 hover:text-red-600 transition-colors"
                                          >
                                            Delete
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    {/* A field on the page, not a browser pop-up: pop-ups are
                                        blocked on phones and in in-app browsers, which is exactly
                                        where Kieran pressed the button and nothing happened. */}
                                    {forwardingId === mail.id && (
                                      <div className="mt-2.5 border border-gold-200 bg-gold-50/40 px-3 py-3">
                                        <label htmlFor={`fwd-${mail.id}`} className="block text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1.5">
                                          Send this same email to
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                          <input
                                            id={`fwd-${mail.id}`}
                                            type="email"
                                            value={forwardTo}
                                            onChange={e => setForwardTo(e.target.value)}
                                            placeholder="their@email.com"
                                            className="flex-1 min-w-[180px] border border-stone-300 px-3 py-2 text-xs text-stone-700 focus:border-gold-700 outline-none bg-white"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const to = forwardTo.trim();
                                              if (!to) return;
                                              sendEmailAgain(mail.id, to);
                                              setForwardingId(null);
                                              setForwardTo('');
                                            }}
                                            disabled={!forwardTo.trim() || emailBusyId === mail.id}
                                            className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            Send it
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { setForwardingId(null); setForwardTo(''); }}
                                            className="text-[9px] tracking-[0.14em] uppercase text-stone-500 px-2 py-2 hover:text-stone-700"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                        <p className="text-[10px] text-stone-500 mt-1.5">
                                          Sends it exactly as it was. To change the wording first, use Edit and send.
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {viewingEmail && (
                    <SentEmailViewer
                      subject={viewingEmail.subject}
                      html={viewingEmail.html}
                      text={viewingEmail.text}
                      onClose={() => setViewingEmail(null)}
                    />
                  )}

                  {composerOpen && c && (
                    <CustomerEmailComposer
                      email={composerTo ?? c.email}
                      setEmail={composerTo === null ? undefined : setComposerTo}
                      reusedFrom={reusingFrom}
                      customerName={displayName(c)}
                      sender={composerSender}
                      setSender={setComposerSender}
                      subject={composerSubject}
                      setSubject={setComposerSubject}
                      message={composerMessage}
                      setMessage={setComposerMessage}
                      draftId={composerDraftId}
                      setDraftId={setComposerDraftId}
                      onClose={() => { setComposerOpen(false); setComposerTo(null); setReusingFrom(null); }}
                      onChanged={() => { loadEmails(); }}
                    />
                  )}

                  </>)}

                </div>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
