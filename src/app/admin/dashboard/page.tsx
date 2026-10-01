'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PRODUCTS } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';
import TopProductsPanel from '@/components/admin/TopProductsPanel';
import OrderStageSquare, { OrderStageKey } from '@/components/admin/OrderStageSquare';
import { formatMoney, formatWholeNumber } from '@/lib/money';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import { subscribeAdminEnquiryCount } from '@/lib/adminEnquiryPolling';
// Type-only: the launch email's From options are fetched from the API, never
// hardcoded in the client bundle (task 286b1863).

interface StoreStats {
  dbConfigured: boolean;
  totalOrders: number;
  pendingOrders: number;
  awaitingPayment: number;
  awaitingDispatch: number;
  inTransit: number;
  revenue: number;
  thisMonthRevenue: number;
  customerCount: number;
  /** New accounts in the rolling last 24 hours, and last 7 days (task c61b59f4). */
  newCustomers24h: number;
  newCustomers7d: number;
  products: number;
}

interface RangeStats {
  totalOrders: number;
  awaitingPayment: number;
  awaitingDispatch: number;
  inTransit: number;
  revenue: number;
}

// Mirrors the union served by /api/admin/activity — one merged feed of
// orders (carrying their live payment status), new customer registrations,
// and automation failures, newest first.
type ActivityEvent =
  | {
      type: 'order';
      at: string;
      paymentConfirmedAt: string | null;
      orderNumber: string;
      customerName: string;
      email: string;
      total: string;
      status: string;
      /** True only for the finished red ones this screen may clear (task 535c24f9). */
      clearable: boolean;
      itemCount: number;
      /** What was actually bought, up to six of them (task 1b153158). */
      items: { name: string; variant: string | null; quantity: number; price: number }[];
      paymentMethod: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      royalMailLabelStatus: string;
      fulfilmentType: string;
    }
  | {
      type: 'customer';
      at: string;
      customerId: number;
      name: string;
      email: string;
      phone: string | null;
      emailVerified: boolean;
      marketingConsent: boolean;
    }
  | {
      type: 'issue';
      at: string;
      /** The database row behind this entry, so the Delete button can name it (task f95367d6). */
      id: number;
      category: string;
      message: string;
      orderNumber: string | null;
    };

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
  // Commas, not em dashes: the house rule bans them in anything a person reads, and these
  // labels are printed on the row chip and now in the opened detail as well (task 1b153158).
  awaiting_dispatch: 'Paid, ready to dispatch',
  processing: 'Paid, ready to dispatch',
  exported: 'Paid, ready to dispatch',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  payment_failed: 'Payment failed',
  cancelled: 'Cancelled',
};

const ORDER_STATUS_CHIP: Record<string, string> = {
  pending: 'bg-orange-50 text-orange-600',
  awaiting_payment: 'bg-orange-50 text-orange-600',
  paid: 'bg-blue-50 text-blue-600',
  awaiting_dispatch: 'bg-sky-50 text-sky-600',
  processing: 'bg-sky-50 text-sky-600',
  exported: 'bg-sky-50 text-sky-600',
  dispatched: 'bg-gold-50 text-gold-700',
  delivered: 'bg-green-50 text-green-600',
  payment_failed: 'bg-red-50 text-red-500',
  cancelled: 'bg-red-50 text-red-500',
};

function activityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' }) + ` ${time}`;
}

// A stable key per event so expanding one row never expands another that
// happens to share a timestamp.
function activityKey(e: ActivityEvent, index: number): string {
  if (e.type === 'order') return `order-${e.orderNumber}`;
  if (e.type === 'customer') return `customer-${e.customerId}`;
  // Keyed on the database id now that the row can be deleted (task f95367d6).
  // With the old index-based key, removing an entry shifted every key below it
  // and React would have re-used the open/confirm state on the wrong row.
  return `issue-${e.id}`;
}

const PAID_STATUSES = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];

const NON_POSTAL_FULFILMENT: Record<string, string> = {
  collection: 'Being collected, so there is no parcel to track.',
  hand_delivered: 'Being hand delivered, so there is no parcel to track.',
  no_delivery: 'Nothing is being posted for this order.',
  other_manual: 'Going out by hand, not Royal Mail, so there is no tracking number.',
};

// When there is no tracking number, say why in the words the person reading it
// would use. A blank space where a number should be reads as a fault (task
// 02195f04), and every one of these is a normal, expected state.
function whyNoTracking(status: string, labelStatus: string): string {
  if (!PAID_STATUSES.includes(status)) return 'No tracking yet. This order has not been paid for.';
  if (labelStatus === 'pending_postage') return 'Royal Mail has the order but is holding the tracking number until the postage is paid in Click & Drop.';
  if (labelStatus === 'error') return 'The Royal Mail label did not go through. Open the order to try it again.';
  return 'No tracking number yet. The Royal Mail label has not been made.';
}

export default function AdminDashboard() {
  const confirm = useConfirm();
  const [stats, setStats] = useState<StoreStats>({
    dbConfigured: true,
    totalOrders: 0,
    pendingOrders: 0,
    awaitingPayment: 0,
    awaitingDispatch: 0,
    inTransit: 0,
    revenue: 0,
    thisMonthRevenue: 0,
    customerCount: 0,
    newCustomers24h: 0,
    newCustomers7d: 0,
    products: PRODUCTS.length,
  });
  const [loading, setLoading] = useState(true);
  const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [setupMessage, setSetupMessage] = useState('');

  // Reviews waiting for approval. A review shows to nobody until it is
  // approved, so the dashboard has to say so on sight rather than leaving it to
  // whoever thinks to open the Reviews page.
  const [pendingReviews, setPendingReviews] = useState(0);

  // Website enquiries nobody has answered, and how long the oldest has waited
  // (task 0c1101e1). Kieran asked why an enquiry was not flagged anywhere; the
  // answer was that this screen had never mentioned enquiries at all, and a
  // real customer had been waiting since 29 July because of it.
  const [newEnquiries, setNewEnquiries] = useState(0);
  const [oldestEnquiryDays, setOldestEnquiryDays] = useState(0);
  const [enquiryCountError, setEnquiryCountError] = useState(false);

  // Anything the website does on its own that failed and nobody has ticked off
  // yet: a verification email that would not send, a dispatch that did not go.
  // It lived only on System Health, which you had to think to open, so the first
  // anyone knew was a customer ringing up (task 34cf57c9). The Dashboard is the
  // page that is already open, so it says so here.
  //
  // This used to be a rolling 24-hour count of every logged entry, which meant a
  // customer's bank declining a payment lit the same red banner as a dispatch
  // that never happened, and an unfixed problem went quiet by itself after a
  // day. It now counts genuine faults that are still open. See
  // src/lib/automationFailureKinds.ts for the split.
  const [failures24h, setFailures24h] = useState(0);

  // Accounts using an address a banned account used (task 9cd55f28). The whole point of the flag
  // is that somebody sees it, and this is the page that is already open.
  const [flaggedAccounts, setFlaggedAccounts] = useState(0);

  // Accounts that may be a second sign-up for a second 10% welcome discount (task c76f31fb).
  // Checked by itself whenever somebody registers; this is the count, and the button below re-runs
  // the same check over everybody on demand.
  const [duplicateAccounts, setDuplicateAccounts] = useState(0);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateCheckFailed, setDuplicateCheckFailed] = useState(false);

  // Products running low (task efc5cb9a): every tracked size with fewer
  // than `lowStockThreshold` units left, straight from the live stock table.
  // Shown right here because reordering starts with noticing. Since task
  // 3378ea2d each row can be fixed in place: save a real number, or press
  // Stop stocking on something no longer sold so it leaves the warnings.
  const [lowStock, setLowStock] = useState<{ slug: string; name: string; dosage: string; quantity: number }[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState(6);
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [lowStockBusy, setLowStockBusy] = useState<string | null>(null);
  const [lowStockError, setLowStockError] = useState('');
  /** When the figures on screen were last read from the live stock table. */
  const [lowStockCheckedAt, setLowStockCheckedAt] = useState<Date | null>(null);
  const [lowStockChecking, setLowStockChecking] = useState(false);
  /** The last check did not answer. Never show an all-clear in this state. */
  const [lowStockCheckFailed, setLowStockCheckFailed] = useState(false);

  /**
   * Re-read the live stock table.
   *
   * These numbers were ALWAYS live (task 734185e7): /api/admin/low-stock is
   * force-dynamic and reads product_variant_stock directly, so nothing here is
   * a daily snapshot. What it did not do was re-read while the page sat open,
   * so a dashboard left open all morning showed the morning's figures with
   * nothing on screen admitting it. Hence the visible "as at" time and the
   * Check now button.
   *
   * Deliberately NOT on a timer. The database bills for time spent awake and
   * sleeps when idle, so polling every few seconds is the one version of this
   * that would genuinely cost more. On demand, plus when the tab is brought
   * back to the front, costs exactly what loading the page costs.
   */
  /**
   * Re-run the second-account check over everybody (task c76f31fb).
   *
   * A REFUSED CHECK IS NOT AN EMPTY ONE — the same lesson the stock check above carries. If this
   * throws, the screen says so rather than quietly reporting that nothing was found, because
   * "nothing found" is exactly what somebody wants to hear and exactly what a failure looks like.
   */
  function runDuplicateCheck() {
    setDuplicateChecking(true);
    setDuplicateCheckFailed(false);
    return fetch('/api/admin/duplicate-accounts')
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || typeof data.recentCount !== 'number' || data.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'no answer');
        }
        setDuplicateAccounts(data.recentCount);
        setDuplicateChecked(true);
      })
      .catch(() => {
        setDuplicateCheckFailed(true);
        setDuplicateChecked(false);
      })
      .finally(() => setDuplicateChecking(false));
  }

  function refreshLowStock() {
    setLowStockChecking(true);
    return fetch('/api/admin/low-stock')
      .then(async res => {
        const data = await res.json().catch(() => null);
        // A REFUSED CHECK IS NOT AN EMPTY ONE. This used to swallow every
        // failure, leaving the list empty — and once the panel below started
        // saying "no products are running low", a 500 from the database read
        // as an all-clear. Found immediately on the read-only local database,
        // which answers 500 here, and it would read identically in production
        // if that query ever failed. Never reassure on a failed read.
        if (!res.ok || !data || !Array.isArray(data.items)) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'no answer');
        }
        setLowStock(data.items);
        if (typeof data.threshold === 'number') setLowStockThreshold(data.threshold);
        setLowStockCheckedAt(new Date());
        setLowStockCheckFailed(false);
      })
      .catch(() => setLowStockCheckFailed(true))
      .finally(() => setLowStockChecking(false));
  }

  async function saveLowStockQuantity(item: { slug: string; name: string; dosage: string }) {
    const key = `${item.slug}::${item.dosage}`;
    const quantity = Number(stockDrafts[key]);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setLowStockError('Type the new stock number first.');
      return;
    }
    setLowStockBusy(`${key}:save`);
    setLowStockError('');
    try {
      const res = await fetch('/api/admin/products/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, dosage: item.dosage, quantity }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not save the new number. Please try again.');
      }
      setStockDrafts(prev => ({ ...prev, [key]: '' }));
      await refreshLowStock();
    } catch (e) {
      setLowStockError(e instanceof Error ? e.message : 'Could not save the new number. Please try again.');
    } finally {
      setLowStockBusy(null);
    }
  }

  async function retireLowStockVariant(item: { slug: string; name: string; dosage: string }) {
    const key = `${item.slug}::${item.dosage}`;
    if (!(await confirm({
      title: `Stop stocking ${item.name} (${item.dosage})?`,
      body: 'It leaves this warning and its emails now. Anything still in stock stays on sale until the last one sells, then it comes off the shop by itself.\n\nBring it back any time from Products, under Retired.',
      confirmLabel: 'Yes, stop stocking it',
      cancelLabel: 'Keep stocking it',
    }))) {
      return;
    }
    setLowStockBusy(`${key}:retire`);
    setLowStockError('');
    try {
      const res = await fetch('/api/admin/products/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: item.slug, dosage: item.dosage, action: 'retire' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not retire it. Please try again.');
      }
      await refreshLowStock();
    } catch (e) {
      setLowStockError(e instanceof Error ? e.message : 'Could not retire it. Please try again.');
    } finally {
      setLowStockBusy(null);
    }
  }

  // The at-a-glance feed (task d2796f97): orders, payments, new customers and
  // problems in one list, each row expandable into its detail.
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);

  // Clearing a red "Problem" row (task f95367d6). Eight copies of a fault that
  // was fixed days ago sit on the first screen anybody opens, and until now
  // there was no way to get rid of one. Only the red rows can be removed: an
  // order or a registration is a record of something that happened, not a
  // notice, and must never be deletable from a glance list.
  //
  // Two steps on purpose. This list is read on a phone, the rows are close
  // together, and a single tap that destroys something for good is the wrong
  // shape for a thumb.
  const [confirmDeleteIssue, setConfirmDeleteIssue] = useState<number | null>(null);
  const [deletingIssue, setDeletingIssue] = useState<number | null>(null);
  const [deleteIssueError, setDeleteIssueError] = useState('');

  // Filing one away instead of destroying it (task f95367d6). This is the
  // everyday gesture and the gentler of the two: the entry moves to System
  // Health under "Already Dealt With", where a Reopen button brings it back.
  // No confirm, because nothing is lost and asking about a reversible thing
  // teaches people to tap through the question that matters.
  const [tickingIssue, setTickingIssue] = useState<number | null>(null);

  // A row that has just been cleared, and how to put it back (task 535c24f9).
  //
  // The tick is one tap with no question asked, which is right because nothing
  // is destroyed by it. What that needs instead is a way back from a mis-tap,
  // so a cleared row leaves a thin strip behind until the page is next loaded.
  // A problem could already be reopened on System Health; a cancelled order had
  // no way back at all, which is what made this worth building once for both.
  const [clearedRows, setClearedRows] = useState<Record<string, string>>({});
  const [restoring, setRestoring] = useState<string | null>(null);

  function forget(key: string) {
    setClearedRows(rows => {
      const next = { ...rows };
      delete next[key];
      return next;
    });
  }

  // Putting a cleared ORDER row back. A cleared problem goes back through the
  // same PATCH that filed it, with resolved: false.
  async function undoClear(key: string, event: ActivityEvent) {
    // A new customer's registration is never cleared, so there is nothing to put
    // back. Narrowed rather than assumed, so this stays true if a fourth kind of
    // row is ever added.
    if (event.type === 'customer') return;
    setRestoring(key);
    setDeleteIssueError('');
    try {
      const url = event.type === 'issue'
        ? `/api/admin/system-health/failures/${event.id}`
        : `/api/admin/orders/${encodeURIComponent(event.orderNumber)}/dashboard-row`;
      const body = event.type === 'issue' ? { resolved: false } : { cleared: false };
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not put that back. Please try again.');
      }
      forget(key);
    } catch (e) {
      setDeleteIssueError(e instanceof Error ? e.message : 'Could not put that back. Please try again.');
    } finally {
      setRestoring(null);
    }
  }

  // Taking a finished order's line off the list. Never the order itself: this
  // sets a stamp, and the Orders screen goes on showing it exactly as before.
  const [clearingOrder, setClearingOrder] = useState<string | null>(null);

  async function clearOrderRow(key: string, orderNumber: string) {
    setClearingOrder(orderNumber);
    setDeleteIssueError('');
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/dashboard-row`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleared: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not take that off the list. Please try again.');
      }
      setClearedRows(rows => ({ ...rows, [key]: `Order ${orderNumber} taken off this list. The order itself is still on the Orders screen.` }));
    } catch (e) {
      setDeleteIssueError(e instanceof Error ? e.message : 'Could not take that off the list. Please try again.');
    } finally {
      setClearingOrder(null);
    }
  }

  async function markIssueDealtWith(id: number, key: string) {
    setTickingIssue(id);
    setDeleteIssueError('');
    try {
      const res = await fetch(`/api/admin/system-health/failures/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not file that away. Please try again.');
      }
      // Leaves a strip with an Undo rather than disappearing outright, so a
      // mis-tap does not mean a trip to System Health to put it back.
      setClearedRows(rows => ({ ...rows, [key]: 'Filed away under Already Dealt With on System Health.' }));
      setConfirmDeleteIssue(null);
    } catch (e) {
      setDeleteIssueError(e instanceof Error ? e.message : 'Could not file that away. Please try again.');
      // Left on the list on purpose: it is still open, and a row that vanished
      // on a failed save would be a lie about where it went.
      setConfirmDeleteIssue(id);
    } finally {
      setTickingIssue(null);
    }
  }

  async function deleteIssue(id: number) {
    setDeletingIssue(id);
    setDeleteIssueError('');
    try {
      const res = await fetch(`/api/admin/system-health/failures/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Could not remove that entry. Please try again.');
      }
      // Off the screen only once the database has actually let go of it, so a
      // failed delete can never leave the operator believing it is gone.
      setActivity(list => list.filter(e => !(e.type === 'issue' && e.id === id)));
      setConfirmDeleteIssue(null);
    } catch (e) {
      setDeleteIssueError(e instanceof Error ? e.message : 'Could not remove that entry. Please try again.');
    } finally {
      setDeletingIssue(null);
    }
  }

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rangeStats, setRangeStats] = useState<RangeStats | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState('');



  // The launch countdown editor and the launch-email sender lived here until
  // the site went live on 2026-07-29. Both were pre-launch-only controls and
  // were removed once they could no longer do anything useful. The countdown
  // API and the send endpoint still exist, so `git show 0c776ce~1` brings the
  // UI back if the site is ever deliberately re-closed with LAUNCH_FORCE_LOCK.

  async function loadRangeStats() {
    if (!dateFrom || !dateTo) return;
    setRangeLoading(true);
    setRangeStats(null);
    setRangeError('');
    try {
      const res = await fetch(`/api/admin/stats/range?from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`);
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setRangeStats(data);
      } else {
        setRangeError(data?.error ?? 'Could not load stats. Check date range.');
      }
    } catch {
      setRangeError('Could not reach the server. Please try again.');
    } finally {
      setRangeLoading(false);
    }
  }

  async function runSetup() {
    setSetupStatus('loading');
    setSetupMessage('');
    try {
      const res = await fetch('/api/admin/db/setup', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setSetupStatus('done');
        setSetupMessage(data?.message || 'Database schema is ready.');
      } else {
        setSetupStatus('error');
        setSetupMessage(data?.error || 'Could not run the database setup. Please try again.');
      }
    } catch {
      setSetupStatus('error');
      setSetupMessage('Could not reach the server. Please try again.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/stats');
        const data = await res.json();
        if (!cancelled) setStats(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    fetch('/api/admin/reviews/pending-count')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && typeof data.pending === 'number') setPendingReviews(data.pending);
      })
      .catch(() => {});

    fetch('/api/admin/system-health')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && typeof data.openCount === 'number') setFailures24h(data.openCount);
      })
      .catch(() => {});

    fetch('/api/admin/ip-addresses?scope=banned-count')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && typeof data.bannedCount === 'number') setFlaggedAccounts(data.bannedCount);
      })
      .catch(() => {});

    fetch('/api/admin/duplicate-accounts')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && typeof data.recentCount === 'number') setDuplicateAccounts(data.recentCount);
      })
      .catch(() => {});

    refreshLowStock();

    fetch('/api/admin/activity')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && Array.isArray(data.events)) setActivity(data.events);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setActivityLoading(false); });

    return () => { cancelled = true; };

  }, []);

  // Customer work can arrive while this screen is already open. Check while it
  // is visible and again when the colleague returns to the tab.
  useEffect(() => {
    return subscribeAdminEnquiryCount(({ data, error }) => {
      if (error || typeof data.oldestDays !== 'number') {
        setEnquiryCountError(true);
        return;
      }
      setNewEnquiries(data.newCount);
      setOldestEnquiryDays(data.oldestDays);
      setEnquiryCountError(false);
    });
  }, []);

  // Re-read the stock figures when this tab is brought back to the front.
  // Costs nothing when nobody is looking, which a timer would not: the
  // database sleeps while idle and every poll would wake it.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshLowStock(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  /** "as at 14:32" — the time the figures on screen were actually read. */
  const lowStockAsAt = lowStockCheckedAt
    ? lowStockCheckedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;

  /** The Check now button and the time beside it, shared by both states below. */
  const lowStockFreshness = (
    <span className="flex items-center gap-2 shrink-0">
      {lowStockAsAt && (
        <span className="text-[10px] text-stone-500 tabular-nums">
          {lowStockChecking ? 'Checking…' : `as at ${lowStockAsAt}`}
        </span>
      )}
      <button
        type="button"
        onClick={() => { void refreshLowStock(); }}
        disabled={lowStockChecking}
        className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.18em] uppercase px-3 py-2 hover:border-gold-700 hover:bg-gold-50 disabled:opacity-40 transition-colors"
      >
        Check now
      </button>
    </span>
  );

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">

      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-5xl">
          {/* The Customers shortcut lives up here on purpose: before launch the
              pre-register list sat on this page, and this button is its
              successor — one press to the panel where every customer (and the
              resend-verification list) now lives (task d2796f97). */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-1">Dashboard</h1>
              <p className="text-xs text-stone-500">Windsor Beauty Admin Overview</p>
            </div>
            {/* Wraps rather than squashing on a phone. */}
            <div className="flex flex-wrap gap-2">
              {/* Run the second-account check now (task c76f31fb). It normally runs by itself when
                  somebody signs up; this is for when you simply want to ask. It only looks: it
                  sends no email and changes nothing, so pressing it twice costs nothing. */}
              <button
                type="button"
                onClick={runDuplicateCheck}
                disabled={duplicateChecking}
                className="shrink-0 border border-gold-300 text-gold-700 text-[10px] tracking-[0.18em] uppercase px-5 py-3 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {duplicateChecking ? 'Checking...' : 'Check for second accounts'}
              </button>
              <Link
                href="/admin/customers"
                className="shrink-0 bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors"
              >
                Customers
              </Link>
            </div>
          </div>

          {/* Said out loud when the answer is "nothing", because a button that looks like it did
              nothing is a button nobody trusts. */}
          {duplicateChecked && duplicateAccounts === 0 && (
            <div className="border border-stone-200 bg-stone-50 px-5 py-3 mb-6 text-xs text-stone-600">
              Checked just now: no account looks like a second sign-up for a second discount.
            </div>
          )}

          {/* Said plainly. The one thing worse than not knowing is being told everything is fine. */}
          {duplicateCheckFailed && (
            <div className="border border-red-200 bg-red-50 px-5 py-3 mb-6 text-xs text-red-700">
              The second-account check could not run just now, so this is not an all-clear. Try again in a moment.
            </div>
          )}

          {/* Something broke. Above the reviews banner on purpose: a fault
              outranks work waiting. Red, where a waiting review is gold, so
              the two never read as the same kind of thing. */}
          {failures24h > 0 && (
            <Link
              href="/admin/system-health"
              className="flex items-center justify-between gap-4 border border-red-300 bg-red-50 px-5 py-4 mb-6 hover:bg-red-100 transition-colors"
            >
              <div>
                <div className="text-[9px] tracking-[0.2em] uppercase text-red-600 font-semibold mb-1">Needs attention</div>
                <div className="text-sm text-stone-800 font-semibold">
                  {failures24h === 1 ? 'Something the website tried to do did not work' : `${formatWholeNumber(failures24h)} things the website tried to do did not work`}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  An email that did not send, a dispatch that did not go, or a job that did not finish. Open it to see what and who it affects, and tick it off once it is sorted.
                </div>
              </div>
              <span className="shrink-0 bg-red-600 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5">
                See what
              </span>
            </Link>
          )}

          {/* An account on an address a banned account used (task 9cd55f28). Shown only when
              there is one, and it asks for a look rather than announcing a verdict: an address is
              shared by a whole house or a whole office. */}
          {flaggedAccounts > 0 && (
            <Link
              href="/admin/ip-addresses"
              className="flex items-center justify-between gap-4 border border-red-300 bg-red-50 px-5 py-4 mb-6 hover:bg-red-100 transition-colors"
            >
              <div>
                <div className="text-[9px] tracking-[0.2em] uppercase text-red-600 font-semibold mb-1">Needs attention</div>
                <div className="text-sm text-stone-800 font-semibold">
                  {flaggedAccounts === 1
                    ? 'An account is using an address a banned account used'
                    : `${formatWholeNumber(flaggedAccounts)} accounts are using an address a banned account used`}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  It can be perfectly innocent. Have a look and decide whether to ban them too.
                </div>
              </div>
              <span className="shrink-0 bg-red-600 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5">
                See who
              </span>
            </Link>
          )}

          {/* Somebody who may have opened a second account to get the 10% welcome discount twice
              (task c76f31fb). Checked automatically the moment a new account is created, and this
              is the same finding shown on one line. Red because Kieran asked for red, and phrased
              as a question because two accounts at one address is a couple far more often than it
              is a fraud. Nobody has been blocked or refused. */}
          {duplicateAccounts > 0 && (
            <Link
              href="/admin/customers"
              className="flex items-center justify-between gap-4 border border-red-300 bg-red-50 px-5 py-4 mb-6 hover:bg-red-100 transition-colors"
            >
              <div>
                <div className="text-[9px] tracking-[0.2em] uppercase text-red-600 font-semibold mb-1">Needs attention</div>
                <div className="text-sm text-stone-800 font-semibold">
                  {duplicateAccounts === 1
                    ? 'An account may be a second sign-up for a second 10% discount'
                    : `${formatWholeNumber(duplicateAccounts)} accounts may be second sign-ups for a second 10% discount`}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  Same address, or the same internet connection, as an account we already have. Often a
                  household. Have a look and decide.
                </div>
              </div>
              <span className="shrink-0 bg-red-600 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5">
                See who
              </span>
            </Link>
          )}

          {/* Stock running low (task efc5cb9a): every tracked size under the
              reorder threshold, named with its live count so deciding what to
              order needs no second screen. Gold, not red — nothing is broken,
              something is waiting to be reordered. The matching email goes to
              sales@ once per drop below the threshold. */}
          {/* The stock check could not be done. Said plainly, because the one
              thing worse than not knowing is being told everything is fine. */}
          {lowStockCheckFailed && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border border-red-200 bg-red-50 px-5 py-3 mb-6">
              <span className="flex-1 min-w-[220px] text-[11px] text-red-700">
                The stock check did not answer, so this is not a clean bill of health. Press Check
                now to try again. If it keeps failing, the stock figures cannot be read.
              </span>
              {lowStockFreshness}
            </div>
          )}

          {/* Nothing running low. Said out loud, with the time it was checked,
              rather than showing nothing at all: an empty dashboard cannot tell
              you whether stock is fine or whether it simply has not looked. */}
          {!lowStockCheckFailed && lowStock.length === 0 && lowStockCheckedAt && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border border-stone-200 bg-white px-5 py-3 mb-6">
              <span className="flex-1 min-w-[220px] text-[11px] text-stone-600">
                No products are running low. Everything is above the {formatWholeNumber(lowStockThreshold)} unit mark.
              </span>
              {lowStockFreshness}
            </div>
          )}

          {lowStock.length > 0 && (
            <div className="border border-gold-300 bg-gold-50 px-5 py-4 mb-6">
              {/* Wraps on a phone (task 1fb77058). Without flex-wrap the button
                  group kept its full width and the sentence was what gave way:
                  it collapsed to a 56px column reading one word per line, and
                  Manage products still hung 34px past the edge of the card. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[9px] tracking-[0.2em] uppercase text-gold-700 font-semibold mb-1">Stock running low</div>
                  <div className="text-sm text-stone-800 font-semibold">
                    {lowStock.length === 1
                      ? `1 product has fewer than ${formatWholeNumber(lowStockThreshold)} units left`
                      : `${formatWholeNumber(lowStock.length)} products have fewer than ${formatWholeNumber(lowStockThreshold)} units left`}
                  </div>
                  <div className="text-[10px] text-stone-500 mt-0.5">
                    Fix a number right here: type the new stock and press Update. Press Stop stocking on anything you will not reorder - it leaves this warning now, sells whatever is left, and comes off the shop by itself when the last one goes.
                  </div>
                </div>
                <span className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {lowStockFreshness}
                  <Link href="/admin/products" className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 transition-colors">
                    Manage products
                  </Link>
                </span>
              </div>
              {lowStockError && <p className="text-[10px] text-red-600 mt-2">{lowStockError}</p>}
              <div className="mt-3 pt-1 border-t border-gold-200 divide-y divide-gold-100">
                {lowStock.map(item => {
                  const key = `${item.slug}::${item.dosage}`;
                  const busySave = lowStockBusy === `${key}:save`;
                  const busyRetire = lowStockBusy === `${key}:retire`;
                  return (
                    <div key={key} className="py-2.5 flex flex-wrap items-center gap-2">
                      <span className="flex-1 min-w-[220px] text-[11px] text-stone-700">
                        {item.name} <span className="text-stone-500">({item.dosage})</span>
                        {' - '}
                        {item.quantity === 0
                          ? <span className="text-red-600 font-semibold">Sold out</span>
                          : <span className="text-gold-700 font-semibold">{formatWholeNumber(item.quantity)} left</span>}
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={stockDrafts[key] ?? ''}
                        onChange={e => setStockDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="New stock"
                        aria-label={`New stock for ${item.name} (${item.dosage})`}
                        className="w-24 border border-stone-200 bg-white px-2.5 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveLowStockQuantity(item)}
                        disabled={lowStockBusy !== null || !(stockDrafts[key] ?? '').trim()}
                        className="bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase px-3.5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-40"
                      >
                        {busySave ? 'Saving…' : 'Update'}
                      </button>
                      <button
                        type="button"
                        onClick={() => retireLowStockVariant(item)}
                        disabled={lowStockBusy !== null}
                        className="border border-stone-300 bg-white text-stone-600 text-[9px] tracking-[0.14em] uppercase px-3.5 py-2.5 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                      >
                        {busyRetire ? 'Stopping…' : 'Stop stocking'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Website enquiries nobody has answered (task 0c1101e1). Shown only
              when there are any, like the reviews banner below: a permanent
              "0 waiting" tile teaches you to stop looking at this corner.
              The AGE is the point. A count alone reads as a small pile; "the
              oldest has been waiting 39 days" is what makes somebody open it. */}
          {enquiryCountError && (
            <Link href="/admin/enquiries" className="block border border-red-300 bg-red-50 text-red-800 px-5 py-4 mb-6 text-sm font-semibold">
              Customer enquiry alerts could not be checked. Open Website Enquiries now.
            </Link>
          )}
          {newEnquiries > 0 && (
            <Link
              href="/admin/enquiries"
              className={`flex items-center justify-between gap-4 border px-5 py-4 mb-6 transition-colors ${
                oldestEnquiryDays >= 3
                  ? 'border-red-300 bg-red-50 hover:bg-red-100'
                  : 'border-gold-300 bg-gold-50 hover:bg-gold-100'
              }`}
            >
              <div>
                <div className={`text-[9px] tracking-[0.2em] uppercase font-semibold mb-1 ${oldestEnquiryDays >= 3 ? 'text-red-700' : 'text-gold-700'}`}>
                  Waiting for you
                </div>
                <div className="text-sm text-stone-800 font-semibold">
                  {newEnquiries} website {newEnquiries === 1 ? 'enquiry has' : 'enquiries have'} not been answered
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  {oldestEnquiryDays >= 1
                    ? `The oldest has been waiting ${oldestEnquiryDays} ${oldestEnquiryDays === 1 ? 'day' : 'days'}. A customer is expecting a reply.`
                    : 'It came in today. A customer is expecting a reply.'}
                </div>
              </div>
              <span className={`shrink-0 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 ${oldestEnquiryDays >= 3 ? 'bg-red-600' : 'bg-gold-700'}`}>
                Answer now
              </span>
            </Link>
          )}

          {/* Reviews waiting. Shown only when there are any, so it keeps its
              meaning: a permanent "0 waiting" tile teaches you to stop looking
              at this corner of the screen. */}
          {pendingReviews > 0 && (
            <Link
              href="/admin/reviews"
              className="flex items-center justify-between gap-4 border border-gold-300 bg-gold-50 px-5 py-4 mb-6 hover:bg-gold-100 transition-colors"
            >
              <div>
                <div className="text-[9px] tracking-[0.2em] uppercase text-gold-700 font-semibold mb-1">Waiting for you</div>
                <div className="text-sm text-stone-800 font-semibold">
                  {formatWholeNumber(pendingReviews)} customer {pendingReviews === 1 ? 'review needs' : 'reviews need'} approving
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">
                  {pendingReviews === 1 ? 'It is' : 'They are'} not on the website until you approve {pendingReviews === 1 ? 'it' : 'them'}.
                </div>
              </div>
              <span className="shrink-0 bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5">
                Review now
              </span>
            </Link>
          )}

          {!stats.dbConfigured && (
            <div className="border border-gold-200 bg-gold-50/50 text-gold-700 text-xs px-4 py-3 mb-6">
              Database not connected - orders, customers, and revenue figures will stay at zero until <span className="font-mono">DATABASE_URL</span> is configured.
            </div>
          )}

          {/* The Announcement Emails block sat here until 2 August, when Kieran said he no longer
              needed it. It was the only place in the admin panel that could send one, so removing
              the block removes the feature rather than relocating it.
              The unused screen component and its send route were removed afterwards. */}

          {/* Stats — row 1: orders overview */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {[
              { label: 'Paid Orders', value: formatWholeNumber(stats.totalOrders), note: 'Payment confirmed, all time', href: '/admin/orders' },
              { label: 'Awaiting Payment', value: formatWholeNumber(stats.awaitingPayment), note: 'Payment started, money not confirmed', accent: stats.awaitingPayment > 0, href: '/admin/orders?status=pending,awaiting_payment' },
              { label: 'Awaiting Dispatch', value: formatWholeNumber(stats.awaitingDispatch), note: 'Paid - ready to ship', accent: stats.awaitingDispatch > 0, href: '/admin/orders?status=paid,awaiting_dispatch,processing,exported' },
              { label: 'In Transit', value: formatWholeNumber(stats.inTransit), note: 'Dispatched, not yet delivered', href: '/admin/orders?status=dispatched' },
            ].map(({ label, value, note, accent, href }) => (
              <Link key={label} href={href} className={`block bg-white border p-5 cursor-pointer hover:border-gold-300 transition-colors ${accent ? 'border-gold-300' : 'border-stone-200'}`}>
                <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">{label}</div>
                <div className={`text-2xl font-semibold mb-1 ${accent ? 'text-gold-700' : 'text-stone-800'}`}>{loading ? '-' : value}</div>
                <div className="text-[9px] text-stone-300">{note}</div>
              </Link>
            ))}
          </div>

          {/* Stats — row 2: revenue + customers.
              Five across on a wide screen since "New Customers" joined it (task c61b59f4), so
              the row stays one line rather than dropping a single box onto a line of its own. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
            {[
              { label: 'Revenue - All Time', value: `£${formatMoney(stats.revenue)}`, note: 'Confirmed payments only', href: '/admin/revenue', accent: false },
              { label: 'Revenue - This Month', value: `£${formatMoney(stats.thisMonthRevenue)}`, note: new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' }), href: '/admin/revenue?period=this_month', accent: false },
              { label: 'Customer Accounts', value: formatWholeNumber(stats.customerCount), note: 'Registered on the website', href: '/admin/customers', accent: false },
              /* Kieran, 9 September: show a separate box for new clients from the preceding day.
                 It gold-borders itself on a
                 day somebody joined, which is the "whenever we have new clients" half of that, and
                 sits quiet on a day nobody did. The week underneath keeps a nought readable: on a
                 shop taking roughly four sign-ups a day, plenty of days are legitimately nought
                 and the box must not read as broken on those. */
              {
                label: 'New Customers',
                value: formatWholeNumber(stats.newCustomers24h),
                note: `Last 24 hours · ${formatWholeNumber(stats.newCustomers7d)} in the last 7 days`,
                href: '/admin/customers',
                accent: stats.newCustomers24h > 0,
              },
              { label: 'Products', value: formatWholeNumber(stats.products), note: 'In catalogue', href: '/admin/products', accent: false },
            ].map(({ label, value, note, href, accent }) => (
              <Link key={label} href={href} className={`block bg-white border p-5 cursor-pointer hover:border-gold-300 transition-colors ${accent ? 'border-gold-300' : 'border-stone-200'}`}>
                <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">{label}</div>
                <div className="text-2xl font-semibold text-stone-800 mb-1">{loading ? '-' : value}</div>
                <div className="text-[9px] text-stone-300">{note}</div>
              </Link>
            ))}
          </div>

          {/* Most popular products (task aa684446). Sits between the figures and the day's
              activity: it is the same kind of question as the tiles above it, and it starts
              closed so it never pushes the activity list off the screen. */}
          <TopProductsPanel />

          {/* Latest activity (task d2796f97): the "what is going on" list.
              Orders arrive carrying their live payment status, new customers
              arrive with their details, and problems arrive in red. One line
              each; press a row for the detail. */}
          <div className="mb-10">
            <h2 className="text-xs tracking-[0.18em] uppercase text-stone-500 font-semibold mb-1">Latest Activity</h2>
            <p className="text-[10px] text-stone-500 mb-4">
              Orders, payments, new customers and anything that went wrong, newest first. Press a row for the detail.
            </p>
            {/* What the coloured squares on the order rows mean (task 41a3910f). */}
            <OrderStageKey className="mb-4" />
            {/* Where a problem goes when it leaves this list (task f95367d6). Rows that
                disappear with no explanation are worse than rows that pile up. */}
            <p className="text-[10px] text-stone-500 mb-4 leading-relaxed">
              On a Problem row, the tick files it away under{' '}
              <Link href="/admin/system-health" className="underline decoration-stone-300 hover:text-gold-700">
                System Health
              </Link>
              , where you can still read it and put it back. The bin removes it for good. On a
              cancelled order, the tick hides the line only: the order stays on the Orders screen.
            </p>
            {/* One place for anything that went wrong while clearing a row. It used to live
                inside the confirm strip, which a failed order clear never opens (task 535c24f9). */}
            {deleteIssueError && (
              <p className="text-[11px] text-red-700 font-semibold mb-3">{deleteIssueError}</p>
            )}
            {activityLoading ? (
              <p className="text-xs text-stone-500">Loading…</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-stone-500">Nothing yet. Payments, registrations and any problems will appear here as they happen.</p>
            ) : (
              <div className="bg-white border border-stone-200 divide-y divide-stone-100">
                {activity.map((event, index) => {
                  const key = activityKey(event, index);
                  const open = expandedActivity === key;
                  // Only a red "Problem" row can be cleared (task f95367d6).
                  const confirming = event.type === 'issue' && confirmDeleteIssue === event.id;
                  // A finished order can be cleared too, but only a red one, and only its
                  // line (task 535c24f9). The server decides which, not this screen.
                  const clearableOrder = event.type === 'order' && event.clearable;
                  const clearedNote = clearedRows[key];

                  // Already cleared in this sitting: a thin strip with the way back,
                  // rather than a row that silently vanished under the thumb.
                  if (clearedNote) {
                    return (
                      <div key={key} className="flex items-center gap-3 px-4 py-3 bg-stone-50">
                        <span className="min-w-0 flex-1 text-[11px] text-stone-500">{clearedNote}</span>
                        <button
                          type="button"
                          onClick={() => undoClear(key, event)}
                          disabled={restoring === key}
                          className="shrink-0 text-[9px] tracking-[0.16em] uppercase font-semibold border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
                        >
                          {restoring === key ? 'Putting back…' : 'Undo'}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={key}>
                      <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => setExpandedActivity(open ? null : key)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 transition-colors"
                      >
                        {event.type === 'order' && (
                          <>
                            {/* The stage square, the same one the Orders screen uses (task
                                41a3910f). Before the chip, so the eye meets the colour first. */}
                            <OrderStageSquare order={event} className="-mr-1" />
                            <span className={`shrink-0 text-[9px] tracking-[0.12em] uppercase px-2 py-1 ${ORDER_STATUS_CHIP[event.status] ?? 'bg-stone-100 text-stone-500'}`}>
                              {event.status === 'awaiting_payment' || event.status === 'pending'
                                ? `Awaiting payment · ${event.paymentMethod === 'fena' ? 'Pay by Bank' : event.paymentMethod === 'paypal' ? 'PayPal' : 'Manual'}`
                                : ORDER_STATUS_LABEL[event.status] ?? event.status}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
                              <span className="font-semibold">{event.paymentConfirmedAt ? 'Order' : 'Payment attempt'} {event.orderNumber}</span>
                              {', '}£{formatMoney(Number(event.total))} from {event.customerName}
                            </span>
                          </>
                        )}
                        {event.type === 'customer' && (
                          <>
                            <span className="shrink-0 text-[9px] tracking-[0.12em] uppercase px-2 py-1 bg-green-50 text-green-700">
                              New customer
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-stone-700">
                              <span className="font-semibold">{event.name}</span> registered
                              {event.emailVerified ? '' : ', email not verified yet'}
                            </span>
                          </>
                        )}
                        {event.type === 'issue' && (
                          <>
                            <span className="shrink-0 text-[9px] tracking-[0.12em] uppercase px-2 py-1 bg-red-50 text-red-600">
                              Problem
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-stone-700">{event.message}</span>
                          </>
                        )}
                        <span className="shrink-0 text-[10px] text-stone-500">{activityTime(event.at)}</span>
                        {/* No chevron where a button sits beside it: the buttons need the
                            width more than the arrow does, and the row is still tappable. */}
                        {event.type !== 'issue' && !clearableOrder && (
                          <span className={`shrink-0 text-stone-300 text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
                        )}
                      </button>
                      {/* A finished order's line, taken off this list (task 535c24f9). The
                          same tick as a problem gets, and deliberately NO bin: an order is
                          a record of real money from a real customer, and the Orders screen
                          goes on showing this one exactly as it was. */}
                      {clearableOrder && event.type === 'order' && (
                        <button
                          type="button"
                          onClick={() => clearOrderRow(key, event.orderNumber)}
                          disabled={clearingOrder === event.orderNumber}
                          aria-label="Take this order off the dashboard list"
                          title="Take this off the dashboard. The order itself is kept."
                          className="shrink-0 flex items-center justify-center w-10 border-l border-stone-100 text-stone-500 hover:bg-gold-50 hover:text-gold-700 transition-colors disabled:opacity-40"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                            <path d="M4 12.5 9 17.5 20 6.5" />
                          </svg>
                        </button>
                      )}
                      {/* Filing one away, the everyday gesture, and the first of the two
                          because it is the one that loses nothing (task f95367d6). */}
                      {event.type === 'issue' && (
                        <button
                          type="button"
                          onClick={() => markIssueDealtWith(event.id, key)}
                          disabled={tickingIssue === event.id}
                          aria-label="Mark this problem as dealt with"
                          title="Dealt with. Moves it to System Health."
                          className="shrink-0 flex items-center justify-center w-10 border-l border-stone-100 text-stone-500 hover:bg-gold-50 hover:text-gold-700 transition-colors disabled:opacity-40"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
                            <path d="M4 12.5 9 17.5 20 6.5" />
                          </svg>
                        </button>
                      )}
                      {/* Its own button, alongside the row rather than inside it: a
                          button cannot legally sit inside another button, and putting
                          it here means opening a row and clearing it stay separate
                          actions on a phone.

                          A bin rather than the word "Delete". The word is 66px wide at
                          this size and the message beside it is already truncated on a
                          phone: spelling it out turned "Adam Brownett tried to p..."
                          into "Adam Br...", which identifies nobody. The same action is
                          spelled out in words inside the opened row below. */}
                      {event.type === 'issue' && (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteIssueError('');
                            setConfirmDeleteIssue(confirming ? null : event.id);
                          }}
                          aria-label={confirming ? 'Keep this problem' : 'Delete this problem'}
                          title={confirming ? 'Keep this problem' : 'Delete this problem'}
                          className={`shrink-0 flex items-center justify-center w-10 border-l border-stone-100 transition-colors ${
                            confirming
                              ? 'bg-stone-100 text-stone-700'
                              : 'text-stone-500 hover:bg-red-50 hover:text-red-700'
                          }`}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
                            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      )}
                      </div>
                      {confirming && event.type === 'issue' && (
                        <div className="px-4 py-3 bg-red-50 border-t border-red-100">
                          <p className="text-[11px] text-red-700 leading-relaxed mb-2.5">
                            Remove this from the list for good? It will not come back, and it will
                            no longer appear on the System Health screen either.
                          </p>
                          {deleteIssueError && (
                            <p className="text-[11px] text-red-700 font-semibold mb-2.5">{deleteIssueError}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => deleteIssue(event.id)}
                              disabled={deletingIssue === event.id}
                              className="text-[9px] tracking-[0.16em] uppercase font-semibold bg-red-700 text-white px-4 py-2 hover:bg-red-800 transition-colors disabled:opacity-50"
                            >
                              {deletingIssue === event.id ? 'Removing…' : 'Yes, remove it'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setConfirmDeleteIssue(null); setDeleteIssueError(''); }}
                              disabled={deletingIssue === event.id}
                              className="text-[9px] tracking-[0.16em] uppercase font-semibold border border-stone-300 text-stone-600 px-4 py-2 hover:border-stone-400 transition-colors disabled:opacity-50"
                            >
                              Keep it
                            </button>
                          </div>
                        </div>
                      )}
                      {open && (
                        <div className="px-4 pb-4 pt-1 bg-stone-50/60">
                          {event.type === 'order' && (
                            <div className="text-[11px] text-stone-600 leading-relaxed">
                              <p>{formatWholeNumber(event.itemCount)} item{event.itemCount === 1 ? '' : 's'}, £{formatMoney(Number(event.total))} total{event.paymentMethod ? `, paying by ${event.paymentMethod === 'fena' ? 'bank transfer (Fena)' : event.paymentMethod === 'paypal' ? 'PayPal' : event.paymentMethod}` : ''}.</p>
                              <p className="text-stone-500">{event.customerName}, {event.email}</p>

                              {/* WHAT was bought (task 1b153158). The row said "1 item" and never
                                  which one, so answering "what did they order" meant opening the
                                  order on another screen. Same shape as the Orders screen uses,
                                  so one order reads the same way in both places. */}
                              {event.items.length > 0 && (
                                <ul className="mt-2 space-y-0.5">
                                  {event.items.map((item, i) => (
                                    <li key={i} className="flex justify-between gap-3">
                                      <span className="min-w-0">
                                        {formatWholeNumber(item.quantity)} &times; {item.name}
                                        {/* Real orders carry an empty dosage, so brackets only
                                            appear when there is something to put in them. */}
                                        {item.variant && <span className="text-stone-500"> ({item.variant})</span>}
                                      </span>
                                      <span className="shrink-0 text-stone-500">
                                        &pound;{formatMoney(item.price * item.quantity)}
                                      </span>
                                    </li>
                                  ))}
                                  {event.itemCount > event.items.length && (
                                    <li className="text-stone-500">
                                      and {formatWholeNumber(event.itemCount - event.items.length)} more. Open the order to see everything.
                                    </li>
                                  )}
                                </ul>
                              )}

                              {/* Where the order has got to, in words. The chip at the top of the
                                  row says it too, but on a phone that chip has scrolled away by
                                  the time this detail is on screen, and it is half of what was
                                  asked for here. No dispatch DATE: dispatched_at is null even on
                                  orders whose status is dispatched, so a date here would be a
                                  guess dressed as a fact. */}
                              <p className="mt-2 text-stone-500">
                                Status: <span className="font-semibold text-stone-700">
                                  {ORDER_STATUS_LABEL[event.status] ?? event.status}
                                </span>
                              </p>

                              {/* Royal Mail tracking, right here (task 02195f04). This one line
                                  is why the row gets opened: reading the number used to cost
                                  four screens on a phone. Tapping it goes straight to Royal Mail. */}
                              <div className="mt-2.5 border border-gold-100 bg-gold-50/30 px-3 py-2.5">
                                <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">
                                  {NON_POSTAL_FULFILMENT[event.fulfilmentType] ? 'Delivery' : 'Royal Mail Tracking'}
                                </p>
                                {NON_POSTAL_FULFILMENT[event.fulfilmentType] ? (
                                  <p className="text-[11px] text-stone-500">{NON_POSTAL_FULFILMENT[event.fulfilmentType]}</p>
                                ) : event.trackingNumber ? (
                                  <>
                                    <a
                                      href={event.trackingUrl ?? undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-mono text-[13px] text-gold-700 hover:underline break-all"
                                    >
                                      {event.trackingNumber}
                                    </a>
                                    <a
                                      href={event.trackingUrl ?? undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 flex items-center justify-center gap-1.5 w-full border border-gold-300 bg-gold-50 text-gold-700 text-[9px] tracking-[0.14em] uppercase font-semibold py-2 hover:bg-gold-100 transition-colors"
                                    >
                                      Track this parcel &rarr;
                                    </a>
                                  </>
                                ) : (
                                  <p className="text-[11px] text-stone-500">{whyNoTracking(event.status, event.royalMailLabelStatus)}</p>
                                )}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <Link href={`/admin/orders?search=${encodeURIComponent(event.orderNumber)}`} className="inline-block text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors">
                                  {event.paymentConfirmedAt ? 'Open order' : 'Open payment attempt'}
                                </Link>
                                {/* The same tick as the row, in words, with what it does NOT
                                    do said out loud (task 535c24f9). */}
                                {event.clearable && (
                                  <button
                                    type="button"
                                    onClick={() => clearOrderRow(key, event.orderNumber)}
                                    disabled={clearingOrder === event.orderNumber}
                                    className="inline-block text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
                                  >
                                    {clearingOrder === event.orderNumber ? 'Taking it off…' : 'Take off this list'}
                                  </button>
                                )}
                              </div>
                              {event.clearable && (
                                <p className="mt-2 text-stone-500">
                                  Taking it off hides this line only. The order stays on the Orders
                                  screen with everything on it.
                                </p>
                              )}
                            </div>
                          )}
                          {event.type === 'customer' && (
                            <div className="text-[11px] text-stone-600 leading-relaxed">
                              <p>{event.email}{event.phone ? `, ${event.phone}` : ''}</p>
                              <p className="text-stone-500">
                                {event.emailVerified ? 'Email verified.' : 'Has not verified their email yet. You can resend the link from their page.'}
                                {' '}{event.marketingConsent ? 'Opted in to marketing.' : 'Not opted in to marketing.'}
                              </p>
                              <Link href={`/admin/customers/${event.customerId}`} className="inline-block mt-2 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors">
                                Open customer
                              </Link>
                            </div>
                          )}
                          {event.type === 'issue' && (
                            <div className="text-[11px] text-stone-600 leading-relaxed">
                              <p>{event.message}</p>
                              <p className="text-stone-500">{event.orderNumber ? `Order ${event.orderNumber}. ` : ''}Recorded under &ldquo;{event.category.replace(/_/g, ' ')}&rdquo;.</p>
                              {/* The same delete as the bin on the row, said in words, right
                                  where the full message has just been read (task f95367d6).
                                  The bin is the quick way through eight copies of one fault;
                                  this is the one you find without having to guess what a
                                  bin does. */}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Link href="/admin/system-health" className="inline-block text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors">
                                  Open system health
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => markIssueDealtWith(event.id, key)}
                                  disabled={tickingIssue === event.id}
                                  className="inline-block text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
                                >
                                  {tickingIssue === event.id ? 'Filing away…' : 'Dealt with'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteIssueError('');
                                    setConfirmDeleteIssue(event.id);
                                  }}
                                  className="inline-block text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-3 py-1.5 hover:border-red-400 hover:text-red-700 transition-colors"
                                >
                                  Delete this entry
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date Range Stats */}
          <div className="mb-10">
            <h2 className="text-xs tracking-[0.18em] uppercase text-stone-500 font-semibold mb-4">Date Range Stats</h2>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="border border-stone-200 px-3 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="border border-stone-200 px-3 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
                />
              </div>
              <button
                onClick={loadRangeStats}
                disabled={rangeLoading || !dateFrom || !dateTo}
                className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
              >
                {rangeLoading ? 'Loading…' : 'View Stats'}
              </button>
            </div>
            {/* Why the button is greyed out, said out loud. A button that cannot be pressed and
                does not say why reads as broken, and this is the first screen anybody sees. */}
            {(!dateFrom || !dateTo) && (
              <p className="text-xs text-stone-500 mb-3">Pick a From date and a To date, then View Stats turns on.</p>
            )}
            {rangeError && <p className="text-xs text-red-500 mb-3">{rangeError}</p>}
            {rangeStats && (() => {
              const allZeros = rangeStats.totalOrders === 0 && rangeStats.awaitingPayment === 0 && rangeStats.awaitingDispatch === 0 && rangeStats.inTransit === 0 && rangeStats.revenue === 0;
              return allZeros ? (
                <p className="text-xs text-stone-500">No data - check date range</p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  {[
                    { label: 'Paid Orders',       value: formatWholeNumber(rangeStats.totalOrders),       href: '/admin/orders' },
                    { label: 'Awaiting Payment',  value: formatWholeNumber(rangeStats.awaitingPayment),   href: '/admin/orders?status=pending,awaiting_payment' },
                    { label: 'Awaiting Dispatch', value: formatWholeNumber(rangeStats.awaitingDispatch),  href: '/admin/orders?status=paid,awaiting_dispatch,processing,exported' },
                    { label: 'In Transit',        value: formatWholeNumber(rangeStats.inTransit),         href: '/admin/orders?status=dispatched' },
                    { label: 'Revenue',           value: `£${formatMoney(rangeStats.revenue)}`,            href: '/admin/revenue' },
                  ].map(({ label, value, href }) => (
                    <Link key={label} href={href} className="block bg-white border border-stone-200 hover:border-gold-300 p-4 cursor-pointer transition-colors">
                      <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">{label}</div>
                      <div className="text-xl font-semibold text-stone-800">{value}</div>
                    </Link>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            <Link href="/admin/orders" className="bg-white border border-stone-200 hover:border-gold-300 p-5 transition-colors">
              <div className="text-xs font-semibold text-stone-700 mb-1">View Orders</div>
              <div className="text-[9px] text-stone-500">Manage and update order statuses</div>
            </Link>
            <Link href="/admin/customers" className="bg-white border border-stone-200 hover:border-gold-300 p-5 transition-colors">
              <div className="text-xs font-semibold text-stone-700 mb-1">View Customers</div>
              <div className="text-[9px] text-stone-500">See accounts, spend, and marketing opt-ins</div>
            </Link>
            <Link href="/admin/products" className="bg-white border border-stone-200 hover:border-gold-300 p-5 transition-colors">
              <div className="text-xs font-semibold text-stone-700 mb-1">Manage Products</div>
              <div className="text-[9px] text-stone-500">Edit products, prices, and stock</div>
            </Link>
            <a href="/" target="_blank" className="bg-white border border-stone-200 hover:border-gold-300 p-5 transition-colors">
              <div className="text-xs font-semibold text-stone-700 mb-1">View Live Site</div>
              <div className="text-[9px] text-stone-500">Open the public website in a new tab</div>
            </a>
          </div>

          {/* Database maintenance — kept permanently visible here (rather than
              tucked away on another page behind an error state) so it's easy
              to find whenever a code update adds new tables or columns. */}
          <div className="bg-white border border-stone-200 p-6 mb-10">
            <h2 className="text-xs tracking-[0.18em] uppercase text-stone-500 font-semibold mb-2">
              Database Maintenance
            </h2>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Run this whenever a site update adds new database tables or columns. It only creates what is
              missing, never touches existing data, and is always safe to run again.
            </p>
            <button
              onClick={runSetup}
              disabled={setupStatus === 'loading'}
              className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
            >
              {setupStatus === 'loading' ? 'Setting up…' : 'Run Database Setup'}
            </button>
            {setupMessage && (
              <p className={`mt-2 text-xs ${setupStatus === 'error' ? 'text-red-600' : 'text-stone-600'}`}>
                {setupMessage}
              </p>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
