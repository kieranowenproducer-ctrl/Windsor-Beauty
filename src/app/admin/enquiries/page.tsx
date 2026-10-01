'use client';
import AdminStickyControls from '@/components/admin/AdminStickyControls';

// Website Enquiries. Every message sent through the contact form, answerable
// from here so the reply goes out as Windsor Glow rather than from whichever
// personal mailbox happened to open the notification email.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { buildPearlReplyTemplate, parsePearlReply } from '@/lib/email/pearlReplyTemplate';
import type { OrderDraftSnapshot } from '@/lib/email/enquiryAutoDraft';
import type { InboundAttachment } from '@/lib/db/enquiries';
import { emailGreetingName } from '@/lib/email/greeting';
import { visibleInboundEmailText } from '@/lib/email/inboundRouting';
import { refreshAdminEnquiryCount } from '@/lib/adminEnquiryPolling';

function withoutEnquiry<T>(values: Record<number, T>, enquiryId: number): Record<number, T> {
  const next = { ...values };
  delete next[enquiryId];
  return next;
}

type EnquiryStatus = 'new' | 'replied' | 'closed';

interface Reply {
  id: number;
  body: string;
  from_address: string;
  provider_message_id: string | null;
  /** 'out' is us. 'in' is the customer answering by email. Older rows have no value and are ours. */
  direction?: 'out' | 'in';
  created_at: string;
  inbound_attachments?: InboundAttachment[] | null;
}

interface Note {
  id: number;
  body: string;
  author: string;
  created_at: string;
}

interface Enquiry {
  id: number;
  name: string;
  email: string;
  subject_key: string;
  subject_label: string;
  order_number: string | null;
  message: string;
  status: EnquiryStatus;
  created_at: string;
  replies: Reply[];
  /* Everything below is null or defaulted on a message sent through the contact form. */
  source: 'website_form' | 'ai_concierge' | 'direct_email' | 'manual_email';
  inbound_attachments?: InboundAttachment[] | null;
  priority: 'normal' | 'high' | 'urgent';
  escalation_reason: string | null;
  ai_summary: string | null;
  attention_flag: string | null;
  conversation_id: string | null;
  transcript: { role: string; content: string }[] | null;
  notes: Note[];
}

interface PearlEmailDraft {
  title: string;
  answer: string;
}

interface AutomatedDraftState {
  status: 'loading' | 'ready' | 'manual' | 'error';
  source?: string;
  note?: string;
  needsExtraCare?: boolean;
  generatedAt?: string;
}

interface OrderDraftContext {
  orderNumber: string;
  snapshot: OrderDraftSnapshot;
}

interface ReplyFeedback {
  tone: 'success' | 'warning' | 'error';
  text: string;
}

const STATUS_STYLES: Record<EnquiryStatus, string> = {
  new: 'bg-gold-50 text-gold-700 border-gold-200',
  replied: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-stone-100 text-stone-500 border-stone-200',
};

const STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'Needs reply',
  replied: 'Answered',
  closed: 'Done',
};

const FILTER_LABEL: Record<'all' | EnquiryStatus, string> = {
  all: 'All',
  new: 'Needs reply',
  replied: 'Answered',
  closed: 'Done',
};

/* The badge that answers "did a person write this, or did the assistant pass it on".
 *
 * Kieran's requirement was that the two must be told apart at a glance. It is a different colour
 * and a different word rather than a small icon, because the distinction changes how you read
 * everything underneath it: a form submission is somebody's own words, a handover is a
 * conversation that did not get anywhere. */
const SOURCE_LABEL: Record<string, string> = {
  website_form: 'Contact form',
  ai_concierge: 'AI Concierge handover',
  direct_email: 'Direct email',
  manual_email: 'Added from mailbox',
};

const SOURCE_STYLES: Record<string, string> = {
  website_form: 'bg-stone-100 text-stone-600 border-stone-200',
  ai_concierge: 'bg-blue-50 text-blue-700 border-blue-200',
  direct_email: 'bg-amber-50 text-amber-800 border-amber-200',
  manual_email: 'bg-amber-50 text-amber-800 border-amber-200',
};

function Attachments({ items }: { items?: InboundAttachment[] | null }) {
  if (!items?.length) return null;
  return (
    <div className="mb-4" aria-label="Customer attachments">
      <p className="text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-1">Attached files</p>
      {items.map(item => (
        <a key={`${item.emailId}-${item.id}`}
          className="block text-sm text-gold-800 underline underline-offset-2 break-all py-1"
          href={`/api/admin/enquiries/attachment?emailId=${encodeURIComponent(item.emailId)}&attachmentId=${encodeURIComponent(item.id)}`}>
          {item.filename}
        </a>
      ))}
    </div>
  );
}

/** Said in words rather than shown as a colour alone, so it survives being printed or skimmed. */
const ATTENTION_LABEL: Record<string, string> = {
  upset: 'Sounds upset',
  vulnerable: 'Handle with care',
  urgent: 'Urgent',
};

interface PendingAction {
  id: string;
  action: string;
  details: {
    reason?: string;
    orderStatus?: string | null;
    newAddress?: { line1?: string; line2?: string | null; city?: string; postcode?: string; country?: string | null };
  };
  order_number: string | null;
  contact_email: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  refund: 'Refund requested',
  cancellation: 'Cancellation requested',
  address_change: 'Address change requested',
};

function when(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function checkedAt(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const [filter, setFilter] = useState<'all' | EnquiryStatus>('all');
  const [source, setSource] = useState<'all' | 'ai_concierge' | 'website_form' | 'direct_email'>('all');
  const [openId, setOpenId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [draftFormats, setDraftFormats] = useState<Record<number, 'standard' | 'pearl' | 'order'>>({});
  const [pearlDrafts, setPearlDrafts] = useState<Record<number, PearlEmailDraft>>({});
  const [automatedDrafts, setAutomatedDrafts] = useState<Record<number, AutomatedDraftState>>({});
  const [orderDrafts, setOrderDrafts] = useState<Record<number, OrderDraftContext>>({});
  const [replyFeedbacks, setReplyFeedbacks] = useState<Record<number, ReplyFeedback>>({});
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  /* Putting a reply that reached our own inbox back on its thread (task bb0a850f). */
  const [pasteOpenId, setPasteOpenId] = useState<number | null>(null);
  const [pastedReplies, setPastedReplies] = useState<Record<number, string>>({});
  const [pastingId, setPastingId] = useState<number | null>(null);
  /* Refund, cancellation and address changes the assistant collected and queued for a person.
   *
   * They live in a different database from the enquiries and they are a different kind of thing:
   * a decision to make, not a message to answer. They are on this screen anyway, at the top,
   * because Kieran asked for one inbox and because "what needs me right now" should not be split
   * across two pages. `/admin/support` now redirects here. */
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch('/api/admin/enquiries');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Could not load enquiries.');
        return;
      }
      setEnquiries(Array.isArray(data?.enquiries) ? data.enquiries : []);
      setError('');
    } catch {
      setError('Could not load enquiries.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  async function addMailboxEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualSaving(true);
    setManualError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const response = await fetch('/api/admin/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(fields.entries())),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.enquiry) throw new Error(data?.error || 'Could not save this email.');
      refreshAdminEnquiryCount();
      form.reset();
      setManualOpen(false);
      setFilter('new');
      setSource('direct_email');
      setOpenId(data.enquiry.id);
      setNotice(data.staffAlertAccepted
        ? 'Email added. Sales and info were sent an alert.'
        : 'Email added. The staff email alert could not be confirmed, so please tell a colleague now.');
      await load(true);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : 'Could not save this email.');
    } finally {
      setManualSaving(false);
    }
  }

  /* Loaded separately and allowed to fail quietly. The approvals come from the concierge's own
   * database, so it being unreachable must not stop the enquiries this page is really about from
   * showing. An empty approvals section and a working inbox beats an error page. */
  const loadActions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support');
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.actions)) setActions(data.actions);
    } catch { /* the inbox below is the point of this page */ }
  }, []);

  async function decideAction(id: string, decision: 'approve' | 'reject') {
    setActionBusy(id);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'action', id, decision }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.outcome) setNotice(data.outcome);
      await loadActions();
    } catch {
      setError('That decision could not be saved.');
    } finally {
      setActionBusy(null);
    }
  }

  useEffect(() => { void load(); void loadActions(); }, [load, loadActions]);

  // Keep the open inbox current as new direct emails and handovers arrive.
  // A quiet refresh leaves replies being drafted and the open case untouched.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  // The standard PEARL letter, as edited on /admin/pearl-email (task 3a5298f5).
  // Empty means nobody has edited it, and the built-in wording is used, so this
  // screen keeps working exactly as before if the fetch fails.
  const [pearlLetter, setPearlLetter] = useState<string>('');
  useEffect(() => {
    fetch('/api/admin/content')
      .then(r => r.json())
      .then(d => {
        const row = (d.content ?? []).find((c: { key: string }) => c.key === 'pearl-email');
        if (typeof row?.body === 'string') setPearlLetter(row.body);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const hasUnsentReply = Object.values(drafts).some(value => value.trim())
      || Object.entries(pearlDrafts).some(([id, value]) => (
        draftFormats[Number(id)] === 'pearl' && Boolean(value.title.trim() || value.answer.trim())
      ));
    if (!hasUnsentReply) return;

    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [drafts, pearlDrafts, draftFormats]);

  async function sendReply(enquiry: Enquiry) {
    const format = draftFormats[enquiry.id] ?? 'standard';
    const pearlDraft = pearlDrafts[enquiry.id] ?? { title: '', answer: '' };
    const orderDraft = orderDrafts[enquiry.id];
    const message = format === 'pearl'
      ? buildPearlReplyTemplate(enquiry.name, pearlDraft.title, pearlDraft.answer, pearlLetter)
      : (drafts[enquiry.id] ?? '').trim();
    if (!message) return;

    setSendingId(enquiry.id);
    setReplyFeedbacks(prev => {
      const next = { ...prev };
      delete next[enquiry.id];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/enquiries/${enquiry.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          format,
          orderNumber: orderDraft?.orderNumber,
          orderSnapshot: orderDraft?.snapshot,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (format === 'order' && data?.refreshedDraft && data?.orderSnapshot && orderDraft) {
          setDrafts(prev => ({ ...prev, [enquiry.id]: data.refreshedDraft }));
          setOrderDrafts(prev => ({ ...prev, [enquiry.id]: {
            orderNumber: orderDraft.orderNumber,
            snapshot: data.orderSnapshot,
          } }));
          setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: {
            status: 'ready',
            source: 'Live order record',
            note: `Order details refreshed from ${orderDraft.orderNumber}. Check the changes before sending.`,
            generatedAt: data.generatedAt,
          } }));
        }
        setReplyFeedbacks(prev => ({ ...prev, [enquiry.id]: {
          tone: 'error',
          text: data?.error || 'The reply could not be sent.',
        } }));
        return;
      }
      refreshAdminEnquiryCount();
      setDrafts(prev => ({ ...prev, [enquiry.id]: '' }));
      setDraftFormats(prev => ({ ...prev, [enquiry.id]: 'standard' }));
      setPearlDrafts(prev => ({ ...prev, [enquiry.id]: { title: '', answer: '' } }));
      setAutomatedDrafts(prev => {
        const next = { ...prev };
        delete next[enquiry.id];
        return next;
      });
      setOrderDrafts(prev => {
        const next = { ...prev };
        delete next[enquiry.id];
        return next;
      });
      setPreviewId(null);
      setReplyFeedbacks(prev => ({ ...prev, [enquiry.id]: {
        tone: data?.recorded === false ? 'warning' : 'success',
        text: data?.recorded === false
          ? `${data?.warning || 'The email was sent, but the dashboard record could not be saved. Do not send it again.'}${data?.providerMessageId ? ` Reference: ${data.providerMessageId}.` : ''}`
          : `Email sent to ${data?.sentTo ?? enquiry.email}. Recorded here${data?.archivedTo ? ' and copied privately to the IONOS mailbox' : ''}.`,
      } }));
      await load();
    } catch {
      setReplyFeedbacks(prev => ({ ...prev, [enquiry.id]: {
        tone: 'error',
        text: 'The reply could not be sent.',
      } }));
    } finally {
      setSendingId(null);
    }
  }

  async function prepareAutomatedDraft(enquiry: Enquiry, refresh = false) {
    if (!refresh && automatedDrafts[enquiry.id]) return;
    if ((drafts[enquiry.id] ?? '').trim() && !refresh) return;

    setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: { status: 'loading' } }));
    setError('');
    try {
      const res = await fetch(`/api/admin/enquiries/${enquiry.id}/draft`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.draft) {
        setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: { status: 'error', note: data?.error || 'The draft could not be prepared.' } }));
        return;
      }

      const prepared = data.draft as {
        format: 'pearl' | 'standard' | 'order' | 'manual';
        title?: string;
        answer?: string;
        message?: string;
        source?: string;
        note?: string;
        needsExtraCare?: boolean;
        orderNumber?: string;
        orderSnapshot?: OrderDraftSnapshot;
        generatedAt?: string;
      };
      if (prepared.format === 'pearl' && prepared.title && prepared.answer) {
        setDraftFormats(prev => ({ ...prev, [enquiry.id]: 'pearl' }));
        setPearlDrafts(prev => ({ ...prev, [enquiry.id]: { title: prepared.title!, answer: prepared.answer! } }));
        setDrafts(prev => ({ ...prev, [enquiry.id]: '' }));
        setOrderDrafts(prev => {
          const next = { ...prev };
          delete next[enquiry.id];
          return next;
        });
        setPreviewId(enquiry.id);
        setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: {
          status: 'ready', source: prepared.source, note: prepared.note, needsExtraCare: prepared.needsExtraCare,
        } }));
        return;
      }
      if (prepared.format === 'order' && prepared.message && prepared.orderNumber && prepared.orderSnapshot) {
        setDraftFormats(prev => ({ ...prev, [enquiry.id]: 'order' }));
        setDrafts(prev => ({ ...prev, [enquiry.id]: prepared.message! }));
        setOrderDrafts(prev => ({ ...prev, [enquiry.id]: {
          orderNumber: prepared.orderNumber!,
          snapshot: prepared.orderSnapshot!,
        } }));
        setPreviewId(enquiry.id);
        setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: {
          status: 'ready', source: prepared.source, note: prepared.note, generatedAt: prepared.generatedAt,
        } }));
        return;
      }
      if (prepared.format === 'standard' && prepared.message) {
        setDraftFormats(prev => ({ ...prev, [enquiry.id]: 'standard' }));
        setDrafts(prev => ({ ...prev, [enquiry.id]: prepared.message! }));
        setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: { status: 'ready', source: prepared.source, note: prepared.note } }));
        return;
      }
      setOrderDrafts(prev => {
        const next = { ...prev };
        delete next[enquiry.id];
        return next;
      });
      setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: { status: 'manual', source: prepared.source, note: prepared.note } }));
    } catch {
      setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: { status: 'error', note: 'The draft could not be prepared.' } }));
    }
  }

  function toggleEnquiry(enquiry: Enquiry) {
    if (openId === enquiry.id) {
      setOpenId(null);
      return;
    }
    setOpenId(enquiry.id);
    void prepareAutomatedDraft(enquiry);
  }

  function insertPearlTemplate(enquiry: Enquiry) {
    if ((drafts[enquiry.id] ?? '').trim()) {
      setError('Clear the current reply before adding the PEARL email template. This keeps your writing from being overwritten.');
      return;
    }
    setError('');
    setNotice('PEARL email opened for a manual answer. Check every word before sending.');
    setDraftFormats(prev => ({ ...prev, [enquiry.id]: 'pearl' }));
    setOrderDrafts(prev => {
      const next = { ...prev };
      delete next[enquiry.id];
      return next;
    });
    setPearlDrafts(prev => ({ ...prev, [enquiry.id]: { title: '', answer: '' } }));
    setAutomatedDrafts(prev => ({ ...prev, [enquiry.id]: { status: 'manual', source: 'PEARL', note: 'Add the PEARL answer manually, then check it before sending.' } }));
  }

  function removePearlTemplate(enquiryId: number) {
    setDrafts(prev => ({ ...prev, [enquiryId]: '' }));
    setDraftFormats(prev => ({ ...prev, [enquiryId]: 'standard' }));
    setPearlDrafts(prev => ({ ...prev, [enquiryId]: { title: '', answer: '' } }));
    setOrderDrafts(prev => {
      const next = { ...prev };
      delete next[enquiryId];
      return next;
    });
    setPreviewId(current => current === enquiryId ? null : current);
    setAutomatedDrafts(prev => ({ ...prev, [enquiryId]: {
      status: 'manual',
      source: 'Human check',
      note: 'The prepared PEARL answer was removed. Write or check the reply normally.',
    } }));
    setNotice('PEARL email template removed.');
  }

  /**
   * Saves a reply the customer sent to our own inbox onto their enquiry.
   *
   * Nothing is emailed. This only puts words that already exist somewhere else back where the
   * person answering the enquiry will see them, and hands the enquiry back to the queue.
   */
  async function recordCustomerReply(enquiry: Enquiry) {
    const message = (pastedReplies[enquiry.id] ?? '').trim();
    if (!message) return;
    setPastingId(enquiry.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/enquiries/${enquiry.id}/record-customer-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'That message could not be saved.');
        return;
      }
      refreshAdminEnquiryCount();
      setPastedReplies(prev => ({ ...prev, [enquiry.id]: '' }));
      setPasteOpenId(null);
      setNotice(`Saved what ${enquiry.name} wrote. This enquiry is back in the queue waiting for an answer.`);
      await load();
      /* The draft on screen was written for the message they sent BEFORE this one, so leaving it
         there would offer an answer to a question they have already been answered. Prepare it
         again against what they have just said. */
      await prepareAutomatedDraft(enquiry, true);
    } catch {
      setError('That message could not be saved.');
    } finally {
      setPastingId(null);
    }
  }

  async function changeStatus(id: number, status: EnquiryStatus) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/enquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Could not update this enquiry.');
        return;
      }
      setEnquiries(prev => prev.map(e => (e.id === id ? { ...e, status } : e)));
      refreshAdminEnquiryCount();
      if (status !== 'closed') {
        setDeleteConfirmId(current => current === id ? null : current);
      }
    } catch {
      setError('Could not update this enquiry.');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteEnquiry(enquiry: Enquiry) {
    if (enquiry.status !== 'closed') {
      setReplyFeedbacks(prev => ({
        ...prev,
        [enquiry.id]: { tone: 'error', text: 'Close this enquiry before deleting it.' },
      }));
      return;
    }

    setDeletingId(enquiry.id);
    setReplyFeedbacks(prev => withoutEnquiry(prev, enquiry.id));
    try {
      const res = await fetch(`/api/admin/enquiries/${enquiry.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setReplyFeedbacks(prev => ({
          ...prev,
          [enquiry.id]: { tone: 'error', text: data?.error || 'Could not delete this enquiry.' },
        }));
        return;
      }

      setEnquiries(prev => prev.filter(item => item.id !== enquiry.id));
      refreshAdminEnquiryCount();
      setDrafts(prev => withoutEnquiry(prev, enquiry.id));
      setDraftFormats(prev => withoutEnquiry(prev, enquiry.id));
      setPearlDrafts(prev => withoutEnquiry(prev, enquiry.id));
      setAutomatedDrafts(prev => withoutEnquiry(prev, enquiry.id));
      setOrderDrafts(prev => withoutEnquiry(prev, enquiry.id));
      setReplyFeedbacks(prev => withoutEnquiry(prev, enquiry.id));
      setOpenId(current => current === enquiry.id ? null : current);
      setPreviewId(current => current === enquiry.id ? null : current);
      setDeleteConfirmId(null);
      setNotice(`${enquiry.name}'s finished enquiry was deleted.`);
    } catch {
      setReplyFeedbacks(prev => ({
        ...prev,
        [enquiry.id]: { tone: 'error', text: 'Could not delete this enquiry.' },
      }));
    } finally {
      setDeletingId(null);
    }
  }

  const byStatus = filter === 'all' ? enquiries : enquiries.filter(e => e.status === filter);
  const visible = source === 'all' ? byStatus : byStatus.filter(e => source === 'direct_email'
    ? e.source === 'direct_email' || e.source === 'manual_email'
    : (e.source ?? 'website_form') === source);
  const newCount = enquiries.filter(e => e.status === 'new').length;
  const handoverCount = enquiries.filter(e => e.source === 'ai_concierge' && e.status !== 'closed').length;

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-semibold text-stone-900">Website Enquiries</h1>
            <button type="button" onClick={() => void load()} className="text-xs text-stone-500 hover:text-stone-800">
              Refresh
            </button>
          </div>
          <p className="text-sm text-stone-500 mb-6">
            Contact form messages and assistant handovers appear here. Add emails received in sales
            or info below until automatic mailbox capture is connected. Replying here sends from
            info@windsorglow.com. Check the sales and info mailboxes for customer replies.
          </p>

          <section className="mb-6 border border-stone-200 bg-white p-4">
            <button type="button" aria-expanded={manualOpen} onClick={() => setManualOpen(open => !open)}
              className="min-h-11 font-semibold text-sm text-stone-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
              {manualOpen ? 'Close email form' : 'Add an email we received'}
            </button>
            {manualOpen && (
              <form onSubmit={event => void addMailboxEmail(event)} className="mt-4 space-y-3">
                <p className="text-xs text-stone-600">Copy the message from sales or info. Adding it sends a staff alert and puts it in this queue.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([['name', 'Customer name'], ['email', 'Customer email'], ['subjectLabel', 'Subject'], ['orderNumber', 'Order number (if known)']] as const).map(([key, label]) => (
                    <label key={key} className="text-xs font-semibold text-stone-700">{label}
                      <input name={key} type={key === 'email' ? 'email' : 'text'} required={key !== 'orderNumber'}
                        maxLength={key === 'subjectLabel' ? 200 : 120}
                        className="mt-1 min-h-11 w-full border border-stone-300 px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" />
                    </label>
                  ))}
                </div>
                <label className="block text-xs font-semibold text-stone-700">What the customer said
                  <textarea name="message" required rows={5} className="mt-1 w-full border border-stone-300 p-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" />
                </label>
                <label className="block text-xs font-semibold text-stone-700">Priority
                  <select name="priority" defaultValue="high" className="mt-1 min-h-11 w-full border border-stone-300 bg-white px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                    <option value="high">High</option><option value="urgent">Urgent</option><option value="normal">Normal</option>
                  </select>
                </label>
                {manualError && <p role="alert" className="text-xs text-red-700">{manualError}</p>}
                <button type="submit" disabled={manualSaving} className="min-h-11 bg-stone-900 px-5 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                  {manualSaving ? 'Saving…' : 'Add email and alert staff'}
                </button>
              </form>
            )}
          </section>

          {/* DECISIONS FIRST. These are the only things on this page that a customer is waiting
              on somebody to say yes or no to, so they sit above the messages rather than below
              them. The assistant collected each one and verified whose order it is; it has never
              performed any of them and cannot. */}
          {actions.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-600 mb-1">
                Waiting for your decision ({actions.length})
              </h2>
              <p className="text-xs text-stone-500 mb-3">
                Requests the assistant took from customers. Approving records your decision here;
                you still carry out the refund or change in the normal admin screens.
              </p>
              <div className="space-y-3">
                {actions.map(a => (
                  <div key={a.id} className="bg-white border border-gold-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 border bg-gold-50 text-gold-700 border-gold-200">
                          {ACTION_LABEL[a.action] ?? a.action.replace(/_/g, ' ')}
                        </span>
                        {a.order_number && (
                          <span className="text-sm font-medium text-stone-800">{a.order_number}</span>
                        )}
                        {a.details?.orderStatus && (
                          <span className="text-xs text-stone-400">order is {a.details.orderStatus}</span>
                        )}
                        <span className="text-xs text-stone-400">· {when(a.created_at)}</span>
                      </div>
                      {a.action === 'address_change' && a.details?.newAddress ? (
                        <p className="text-sm text-stone-600">
                          New address: {[
                            a.details.newAddress.line1, a.details.newAddress.line2,
                            a.details.newAddress.city, a.details.newAddress.postcode,
                            a.details.newAddress.country,
                          ].filter(Boolean).join(', ')}
                        </p>
                      ) : (
                        <p className="text-sm text-stone-600">{a.details?.reason || 'No reason given.'}</p>
                      )}
                      {a.contact_email && <p className="text-xs text-stone-400 mt-0.5">{a.contact_email}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button" disabled={actionBusy === a.id}
                        onClick={() => void decideAction(a.id, 'approve')}
                        className="bg-stone-900 text-white text-xs font-semibold px-4 py-2 disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        type="button" disabled={actionBusy === a.id}
                        onClick={() => void decideAction(a.id, 'reject')}
                        className="border border-stone-300 text-stone-600 text-xs font-semibold px-4 py-2 disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Where it came from, separate from what state it is in, because they are different
              questions. "Show me the handovers" and "show me what is unanswered" are both things
              somebody sitting down to this wants, and folding them into one row of buttons would
              make each combination its own button. */}
          {/* Pinned controls stay on screen while the colleague works through the list. */}
          <AdminStickyControls inset="p-8">
          <label htmlFor="enquiry-source-filter" className="sr-only">Filter enquiries by source</label>
          <select
            id="enquiry-source-filter"
            name="enquiry-source-filter"
            value={source}
            onChange={event => setSource(event.target.value as typeof source)}
            className="mb-2 min-h-11 w-full border border-stone-300 bg-white px-3 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 sm:hidden"
          >
            <option value="all">Everything</option>
            <option value="ai_concierge">From the assistant{handoverCount > 0 ? ` (${handoverCount})` : ''}</option>
            <option value="website_form">From the contact form</option>
            <option value="direct_email">Direct email</option>
          </select>
          <div className="mb-2 hidden items-center gap-2 sm:flex sm:flex-wrap">
            {([
              ['all', 'Everything'],
              ['ai_concierge', 'From the assistant'],
              ['website_form', 'From the contact form'],
              ['direct_email', 'Direct email'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSource(key)}
                aria-pressed={source === key}
                className={`shrink-0 text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 ${
                  source === key
                    ? 'border-stone-800 bg-stone-800 text-white'
                    : 'border-stone-200 text-stone-500 hover:border-stone-400'
                }`}
              >
                {label}
                {key === 'ai_concierge' && handoverCount > 0 ? ` (${handoverCount})` : ''}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2 pb-3 sm:flex sm:flex-wrap">
            {(['all', 'new', 'replied', 'closed'] as const).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`min-w-0 text-[9px] tracking-[0.11em] uppercase px-2 py-2 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 sm:shrink-0 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.15em] ${
                  filter === key
                    ? 'border-stone-800 bg-stone-800 text-white'
                    : 'border-stone-200 text-stone-500 hover:border-stone-400'
                }`}
              >
                {FILTER_LABEL[key]}
                {key === 'new' && newCount > 0 ? ` (${newCount})` : ''}
              </button>
            ))}
          </div>
          </AdminStickyControls>

          {notice && <div role="status" aria-live="polite" className="bg-green-50 border border-green-200 text-green-800 text-xs px-4 py-3 mb-6">{notice}</div>}
          {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 mb-6">{error}</div>}
          {loading && <p role="status" aria-live="polite" className="text-sm text-stone-400">Loading…</p>}

          {!loading && visible.length === 0 && (
            <p className="text-sm text-stone-400 bg-white border border-stone-200 px-4 py-8 text-center">
              {filter === 'all'
                ? 'No enquiries yet. Contact forms, direct emails and assistant handovers will appear here.'
                : `No ${filter} enquiries.`}
            </p>
          )}

          <div className="space-y-3">
            {visible.map(enquiry => {
              const open = openId === enquiry.id;
              const draft = drafts[enquiry.id] ?? '';
              const pearlDraft = pearlDrafts[enquiry.id] ?? { title: '', answer: '' };
              const automatedDraft = automatedDrafts[enquiry.id];
              const replyFeedback = replyFeedbacks[enquiry.id];
              const pearlTemplateIncomplete = draftFormats[enquiry.id] === 'pearl' && (!pearlDraft.title.trim() || !pearlDraft.answer.trim());
              return (
                <article key={enquiry.id} className="bg-white border border-stone-200">
                  <button
                    type="button"
                    onClick={() => toggleEnquiry(enquiry)}
                    aria-expanded={open}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-stone-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[9px] tracking-wider uppercase px-2 py-0.5 border ${STATUS_STYLES[enquiry.status]}`}>
                          {STATUS_LABEL[enquiry.status]}
                        </span>
                        {/* Where it came from, first, because it changes how the rest reads. */}
                        <span className={`text-[9px] tracking-wider uppercase px-2 py-0.5 border ${
                          SOURCE_STYLES[enquiry.source] ?? SOURCE_STYLES.website_form
                        }`}>
                          {SOURCE_LABEL[enquiry.source] ?? 'Contact form'}
                        </span>
                        {enquiry.attention_flag && (
                          <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 border bg-red-50 text-red-700 border-red-200">
                            {ATTENTION_LABEL[enquiry.attention_flag] ?? enquiry.attention_flag}
                          </span>
                        )}
                        {enquiry.priority === 'urgent' || enquiry.priority === 'high' ? (
                          <span className="text-[9px] tracking-wider uppercase px-2 py-0.5 border bg-gold-50 text-gold-700 border-gold-200">
                            {enquiry.priority}
                          </span>
                        ) : null}
                        <span className="text-sm font-medium text-stone-800">{enquiry.name}</span>
                        <span className="text-xs text-stone-400">{enquiry.subject_label}</span>
                        {enquiry.order_number && (
                          <span className="text-xs font-mono text-gold-700">{enquiry.order_number}</span>
                        )}
                        <span className="text-xs text-stone-400">· {when(enquiry.created_at)}</span>
                      </div>
                      <p className="text-xs text-stone-500 truncate">{enquiry.message}</p>
                    </div>
                    <span className="text-stone-300 text-xs pt-1">{open ? '−' : '+'}</span>
                  </button>

                  {open && (
                    <div className="border-t border-stone-100 px-4 py-4">
                      <p className="text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-1">From</p>
                      <p className="text-xs text-stone-600 mb-4">
                        {enquiry.name} &middot; <span className="text-gold-700">{enquiry.email}</span>
                      </p>

                      {/* THE HANDOVER BLOCK.
                          Ordered by what a colleague picking this up needs first: why the
                          assistant gave up, then what it thinks the problem is, then the
                          customer's own words, then the conversation only if they want it.
                          The transcript is deliberately behind a fold: Kieran's instruction was
                          not to dump a raw conversation into the page, and a summary somebody
                          reads beats a transcript they skip. */}
                      {enquiry.source === 'ai_concierge' && (
                        <div className="mb-5 border border-blue-200 bg-blue-50/40 px-4 py-3">
                          {enquiry.escalation_reason && (
                            <>
                              <p className="text-[10px] tracking-[0.15em] uppercase text-blue-700 mb-1">
                                Why the assistant passed this on
                              </p>
                              <p className="text-sm text-stone-700 mb-3">{enquiry.escalation_reason}</p>
                            </>
                          )}
                          {enquiry.ai_summary && (
                            <>
                              <p className="text-[10px] tracking-[0.15em] uppercase text-blue-700 mb-1">
                                What it is about
                              </p>
                              <p className="text-sm text-stone-700 mb-3">{enquiry.ai_summary}</p>
                            </>
                          )}
                          {enquiry.transcript && enquiry.transcript.length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[10px] tracking-[0.15em] uppercase text-blue-700">
                                Read the conversation ({enquiry.transcript.length} messages)
                              </summary>
                              <div className="mt-3 space-y-2">
                                {enquiry.transcript.map((turn, i) => (
                                  <div
                                    key={i}
                                    className={`text-xs whitespace-pre-wrap px-3 py-2 ${
                                      turn.role === 'user'
                                        ? 'bg-white border-l-2 border-stone-300'
                                        : 'bg-blue-50 border-l-2 border-blue-200 text-stone-600'
                                    }`}
                                  >
                                    <span className="block text-[9px] uppercase tracking-wider text-stone-400 mb-0.5">
                                      {turn.role === 'user' ? 'Customer' : 'Assistant'}
                                    </span>
                                    {turn.content}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}

                      <p className="text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-1">
                        {enquiry.source === 'ai_concierge' ? 'What the customer said' : 'Message'}
                      </p>
                      <p className="text-sm text-stone-700 whitespace-pre-wrap bg-stone-50 px-4 py-3 mb-5">{enquiry.message}</p>
                      <Attachments items={enquiry.inbound_attachments} />

                      {/* Anything the assistant added later in the same conversation. This is what
                          stops one customer's problem arriving as three separate enquiries. */}
                      {enquiry.notes?.length > 0 && (
                        <div className="mb-5">
                          <p className="text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-2">
                            Added later in the same conversation
                          </p>
                          <div className="space-y-2">
                            {enquiry.notes.map(note => (
                              <div key={note.id} className="border-l-2 border-blue-200 pl-3">
                                <p className="text-sm text-stone-700 whitespace-pre-wrap">{note.body}</p>
                                <p className="text-[10px] text-stone-400 mt-1">
                                  {note.author} &middot; {when(note.created_at)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* THE CONVERSATION, BOTH WAYS. This used to be headed "Sent replies" and
                          held only our own words, so a customer who answered by email had nowhere
                          to appear and the enquiry read as finished. Their messages now sit on the
                          same thread and are marked as theirs, because the one thing this list
                          must never do is show you something a customer said and let you read it
                          as something we told them. */}
                      {enquiry.replies.length > 0 && (
                        <div className="mb-5">
                          <p className="text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-2">
                            Conversation
                          </p>
                          <div className="space-y-2">
                            {enquiry.replies.map(reply => {
                              const fromCustomer = reply.direction === 'in';
                              const visibleBody = fromCustomer ? visibleInboundEmailText(reply.body) : reply.body;
                              const hasHiddenHistory = fromCustomer && visibleBody.trim() !== reply.body.trim();
                              return (
                                <div
                                  key={reply.id}
                                  className={`border-l-2 px-3 py-3 ${fromCustomer
                                    ? 'border-stone-400 bg-stone-50'
                                    : 'border-gold-300 bg-gold-50/40'}`}
                                >
                                  <p className={`text-[10px] tracking-[0.15em] uppercase mb-1.5 ${fromCustomer ? 'text-stone-700' : 'text-gold-800'}`}>
                                    {fromCustomer ? 'Customer replied' : 'Windsor Glow replied'}
                                  </p>
                                  <p className="text-sm text-stone-700 whitespace-pre-wrap">{visibleBody}</p>
                                  {hasHiddenHistory ? (
                                    <details className="mt-3 border-t border-stone-200 pt-2">
                                      <summary className="cursor-pointer text-[10px] uppercase tracking-[0.12em] text-stone-500 hover:text-stone-800">
                                        Show quoted earlier email
                                      </summary>
                                      <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap bg-white px-3 py-2 text-xs leading-5 text-stone-500">
                                        {reply.body}
                                      </p>
                                    </details>
                                  ) : null}
                                  <Attachments items={reply.inbound_attachments} />
                                  <p className="mt-1 break-all text-[10px] text-stone-400">
                                    {when(reply.created_at)}
                                    {reply.provider_message_id ? ` · Recorded ${reply.provider_message_id}` : ''}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* A REPLY THAT CAME STRAIGHT TO OUR INBOX. Emma answered her enquiry by
                          email and there was no way to get her words onto the thread at all, so
                          the enquiry sat here looking answered while she waited. Capture does this
                          on its own once the inbound address is switched on; this stays because
                          info@ is printed on the contact page and people write to it directly. */}
                      <div className="mb-3">
                        {pasteOpenId === enquiry.id ? (
                          <div className="border border-stone-200 bg-stone-50 p-3">
                            <label htmlFor={`pasted-${enquiry.id}`} className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-2">
                              What {enquiry.name} wrote
                            </label>
                            <textarea
                              id={`pasted-${enquiry.id}`}
                              name={`pasted-${enquiry.id}`}
                              value={pastedReplies[enquiry.id] ?? ''}
                              onChange={e => setPastedReplies(prev => ({ ...prev, [enquiry.id]: e.target.value }))}
                              rows={5}
                              placeholder="Paste their email here, exactly as they sent it."
                              className="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                            />
                            <p className="text-[10px] text-stone-400 mt-1.5 mb-3">
                              This saves their words here and puts the enquiry back in the queue. Nothing is emailed to anyone.
                            </p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => void recordCustomerReply(enquiry)}
                                disabled={pastingId === enquiry.id || !(pastedReplies[enquiry.id] ?? '').trim()}
                                className="min-h-10 text-[10px] tracking-[0.15em] uppercase px-4 py-2 bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                              >
                                {pastingId === enquiry.id ? 'Saving…' : 'Save their message'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPasteOpenId(null)}
                                className="min-h-10 text-[10px] tracking-[0.15em] uppercase px-4 py-2 border border-stone-200 text-stone-500 hover:border-stone-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPasteOpenId(enquiry.id)}
                            className="text-[10px] tracking-[0.15em] uppercase text-stone-500 underline underline-offset-4 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                          >
                            They replied to our inbox instead. Add it here
                          </button>
                        )}
                      </div>

                      <div aria-live="polite" className={`mb-3 flex flex-col gap-3 border p-3 sm:flex-row sm:items-center sm:justify-between ${
                        automatedDraft?.status === 'ready'
                          ? 'border-green-200 bg-green-50/60'
                          : automatedDraft?.status === 'error'
                            ? 'border-red-200 bg-red-50/50'
                            : 'border-gold-200 bg-gold-50/60'
                      }`}>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-800">
                            {automatedDraft?.status === 'loading' ? 'Preparing an email draft'
                              : automatedDraft?.status === 'ready' ? 'Draft ready for approval'
                                : automatedDraft?.status === 'manual' ? 'Human reply needed'
                                  : automatedDraft?.status === 'error' ? 'Draft could not be prepared'
                                    : 'Automatic email draft'}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-stone-600">
                            {automatedDraft?.status === 'loading'
                              ? 'Checking PEARL and the customer’s order information now.'
                              : automatedDraft?.note || 'The system checks the enquiry first. Nothing is sent until you approve it.'}
                          </p>
                          {automatedDraft?.source ? <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-stone-500">Prepared using {automatedDraft.source}</p> : null}
                          {checkedAt(automatedDraft?.generatedAt) ? (
                            <p className="mt-1 text-[10px] text-stone-500">Order details checked at {checkedAt(automatedDraft?.generatedAt)}.</p>
                          ) : null}
                          {automatedDraft?.needsExtraCare ? <p className="mt-2 text-xs font-semibold text-red-700">PEARL marked this wording for extra care. Check it closely before sending.</p> : null}
                        </div>
                        {draftFormats[enquiry.id] === 'pearl' ? (
                          <button
                            type="button"
                            onClick={() => removePearlTemplate(enquiry.id)}
                            className="min-h-10 shrink-0 border border-gold-300 bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800 hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                          >
                            Use normal reply
                          </button>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void prepareAutomatedDraft(enquiry, true)}
                              disabled={automatedDraft?.status === 'loading'}
                              className="min-h-10 shrink-0 border border-gold-300 bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800 hover:border-gold-500 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                            >
                              Check again
                            </button>
                            {automatedDraft?.status === 'manual' ? (
                              <button
                                type="button"
                                onClick={() => insertPearlTemplate(enquiry)}
                                className="min-h-10 shrink-0 bg-gold-700 px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                              >
                                Add PEARL answer manually
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {draftFormats[enquiry.id] === 'pearl' ? (
                        <div className="mb-4 border border-stone-200 bg-stone-50 p-4">
                          <div className="mb-5 flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-800">Review PEARL’s prepared answer</p>
                              <p className="mt-1 text-xs leading-5 text-stone-600">The customer’s question and available product information have already been checked. Edit anything that needs changing.</p>
                            </div>
                            <a
                              href={`/admin/pearl?ask=${encodeURIComponent(enquiry.message)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex min-h-10 shrink-0 items-center justify-center border border-gold-300 bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-gold-800 hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                            >
                              Open question in PEARL
                            </a>
                          </div>

                          <div className="grid gap-4">
                            <label htmlFor={`pearl-title-${enquiry.id}`} className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-800">Answer heading</span>
                              <span className="mt-1 block text-xs text-stone-500">Prepared by PEARL. Change it only if needed.</span>
                              <input
                                id={`pearl-title-${enquiry.id}`}
                                name={`pearl-title-${enquiry.id}`}
                                autoComplete="off"
                                value={pearlDraft.title}
                                onChange={event => setPearlDrafts(prev => ({ ...prev, [enquiry.id]: { ...pearlDraft, title: event.target.value } }))}
                                placeholder="Add the compound or question title"
                                className="mt-2 min-h-11 w-full border border-stone-300 bg-white px-3 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                              />
                            </label>

                            <label htmlFor={`pearl-answer-${enquiry.id}`} className="block">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-800">PEARL’s answer</span>
                              <span className="mt-1 block text-xs text-stone-500">This is already filled in. The compliance wording is also included automatically.</span>
                              <textarea
                                id={`pearl-answer-${enquiry.id}`}
                                name={`pearl-answer-${enquiry.id}`}
                                value={pearlDraft.answer}
                                onChange={event => setPearlDrafts(prev => ({ ...prev, [enquiry.id]: { ...pearlDraft, answer: event.target.value } }))}
                                rows={8}
                                placeholder="Paste the checked PEARL answer here"
                                className="mt-2 w-full border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                              />
                            </label>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setPreviewId(current => current === enquiry.id ? null : enquiry.id)}
                              disabled={pearlTemplateIncomplete}
                              className="min-h-10 border border-stone-300 bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-700 hover:border-gold-500 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                            >
                              {previewId === enquiry.id ? 'Hide email preview' : 'Preview customer email'}
                            </button>
                            <p className="text-xs text-stone-500">Sends from <strong className="font-semibold text-stone-700">info@windsorglow.com</strong></p>
                          </div>

                          {previewId === enquiry.id && !pearlTemplateIncomplete ? (
                            <div className="mt-5 overflow-hidden border border-stone-300 bg-white shadow-sm" aria-label="Customer email preview">
                              <div className="bg-stone-950 px-5 py-5 text-center">
                                <p className="font-serif text-xl text-gold-400">Windsor Glow</p>
                                <p className="mt-2 text-[9px] uppercase tracking-[0.26em] text-amber-100">Product information</p>
                              </div>
                              {/* Built from the SAME letter the send uses (task 3a5298f5).
                                  This preview used to have the wording typed into it a second
                                  time, so the moment the letter became editable it would have
                                  been showing copy nobody was sending any more. */}
                              {(() => {
                                const previewMessage = buildPearlReplyTemplate(enquiry.name, pearlDraft.title, pearlDraft.answer, pearlLetter);
                                const p = parsePearlReply(previewMessage);
                                if (!p) return null;
                                const [pearlTitleLine, ...pearlRest] = p.pearl.split('\n');
                                return (
                                  <div className="p-5 text-xs leading-6 text-stone-600">
                                    {p.before.split(/\n{2,}/).filter(Boolean).map((block, i) => (
                                      <p key={`pb${i}`} className={i === 0 ? 'whitespace-pre-wrap' : 'mt-3 whitespace-pre-wrap'}>{block}</p>
                                    ))}
                                    <div className="mt-4 border border-gold-200 border-t-2 border-t-gold-600 bg-gold-50/60 p-4">
                                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-800">PEARL</p>
                                      <p className="mt-1 text-[10px] text-stone-500">Peptide Experimental Analysis Research Library</p>
                                      <p className="mt-3 font-serif text-base text-stone-800">{pearlTitleLine}</p>
                                      <p className="mt-2 whitespace-pre-wrap">{pearlRest.join('\n').trim()}</p>
                                    </div>
                                    {p.after.split(/\n{2,}/).filter(Boolean).map((block, i) => (
                                      <p key={`pa${i}`} className="mt-3 whitespace-pre-wrap">{block}</p>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <label htmlFor={`reply-${enquiry.id}`} className="block text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-2">
                            {automatedDraft?.status === 'ready' ? 'Email draft to check' : 'Your reply'}
                          </label>
                           <textarea
                             id={`reply-${enquiry.id}`}
                             name={`reply-${enquiry.id}`}
                             value={draft}
                            onChange={e => setDrafts(prev => ({ ...prev, [enquiry.id]: e.target.value }))}
                            rows={7}
                             placeholder={`Hi ${emailGreetingName(enquiry.name) || 'there'},`}
                             className="w-full border border-stone-200 px-3 py-2 text-sm text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                           />
                          <p className="text-[10px] text-stone-400 mt-1.5 mb-3">
                             Goes to {enquiry.email} from info@windsorglow.com. Their original message is quoted underneath so it makes sense on its own.
                           </p>
                           {draftFormats[enquiry.id] === 'order' && draft.trim() ? (
                             <div className="mb-4">
                               <button
                                 type="button"
                                 onClick={() => setPreviewId(current => current === enquiry.id ? null : enquiry.id)}
                                 className="min-h-10 border border-stone-300 bg-white px-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-700 hover:border-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                               >
                                 {previewId === enquiry.id ? 'Hide email preview' : 'Preview customer email'}
                               </button>
                               {previewId === enquiry.id ? (
                                 <div className="mt-4 overflow-hidden border border-stone-300 bg-white shadow-sm" aria-label="Customer email preview">
                                   <div className="bg-stone-950 px-5 py-5 text-center">
                                     <p className="font-serif text-xl text-gold-400">Windsor Glow</p>
                                     <p className="mt-2 text-[9px] uppercase tracking-[0.26em] text-amber-100">Order update</p>
                                   </div>
                                   <div className="p-5 text-xs leading-6 text-stone-600">
                                     <p>Hello {enquiry.name},</p>
                                     <p className="mt-3 whitespace-pre-wrap">{draft}</p>
                                   </div>
                                 </div>
                               ) : null}
                             </div>
                           ) : null}
                         </>
                       )}

                      {replyFeedback ? (
                        <div
                          role={replyFeedback.tone === 'error' ? 'alert' : 'status'}
                          aria-live="polite"
                          className={`mb-3 border px-4 py-3 text-xs ${replyFeedback.tone === 'error'
                            ? 'border-red-200 bg-red-50 text-red-700'
                            : replyFeedback.tone === 'warning'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-green-200 bg-green-50 text-green-800'}`}
                        >
                          {replyFeedback.text}
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => void sendReply(enquiry)}
                          disabled={sendingId === enquiry.id || (draftFormats[enquiry.id] === 'pearl' ? pearlTemplateIncomplete : !draft.trim())}
                          className="min-h-10 text-[10px] tracking-[0.15em] uppercase px-4 py-2 bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                        >
                          {sendingId === enquiry.id
                            ? 'Sending…'
                            : automatedDraft?.status === 'ready'
                              ? 'Approve and send email'
                              : draftFormats[enquiry.id] === 'pearl'
                                ? 'Send PEARL email'
                                : 'Send reply'}
                        </button>
                        {enquiry.status !== 'closed' ? (
                          <button
                            type="button"
                            onClick={() => void changeStatus(enquiry.id, 'closed')}
                            disabled={busyId === enquiry.id}
                            className="min-h-10 text-[10px] tracking-[0.15em] uppercase px-4 py-2 border border-stone-200 text-stone-500 hover:border-stone-400 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                          >
                            Mark done
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void changeStatus(enquiry.id, 'new')}
                              disabled={busyId === enquiry.id || deletingId === enquiry.id}
                              className="min-h-10 text-[10px] tracking-[0.15em] uppercase px-4 py-2 border border-stone-200 text-stone-500 hover:border-stone-400 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                            >
                              Reopen
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(enquiry.id)}
                              disabled={deletingId === enquiry.id}
                              className="min-h-10 text-[10px] tracking-[0.15em] uppercase px-4 py-2 border border-red-200 text-red-700 hover:border-red-400 hover:bg-red-50 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            >
                              Delete enquiry
                            </button>
                          </>
                        )}
                      </div>

                      {deleteConfirmId === enquiry.id ? (
                        <div
                          role="alertdialog"
                          aria-modal="false"
                          aria-labelledby={`delete-enquiry-title-${enquiry.id}`}
                          aria-describedby={`delete-enquiry-description-${enquiry.id}`}
                          className="mt-3 border border-red-200 bg-red-50 px-4 py-4"
                        >
                          <p id={`delete-enquiry-title-${enquiry.id}`} className="text-sm font-semibold text-red-900">
                            Delete this finished enquiry?
                          </p>
                          <p id={`delete-enquiry-description-${enquiry.id}`} className="mt-1 text-xs leading-5 text-red-800">
                            This permanently removes {enquiry.name}&apos;s enquiry and its saved replies. It cannot be recovered.
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void deleteEnquiry(enquiry)}
                              disabled={deletingId === enquiry.id}
                              className="min-h-10 bg-red-700 px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-white transition-colors hover:bg-red-800 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            >
                              {deletingId === enquiry.id ? 'Deleting…' : 'Delete permanently'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              disabled={deletingId === enquiry.id}
                              className="min-h-10 border border-red-200 bg-white px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-red-800 transition-colors hover:border-red-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                            >
                              Keep enquiry
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
