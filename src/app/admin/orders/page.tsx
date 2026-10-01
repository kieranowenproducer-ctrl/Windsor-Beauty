'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';

import {
  STATUS_OPTIONS,
  STATUS_LABELS,
  type OrderStatus,
  type RoyalMailLabelStatus,
  type Order,
  type OrderTab,
  type OrderSort,
  orderSearchText,
  sortOrders,
  orderDayInUk,
} from './orderTypes';
import OrderFilters from './OrderFilters';
import BulkSelectionToolbar from './BulkSelectionToolbar';
import OrdersTable from './OrdersTable';
import { isOrderArchived, orderArchiveState } from '@/lib/orderArchive';
import OrderDetailPanel from './OrderDetailPanel';
import OrderActions from './OrderActions';
import { parseSearchGroups, matchesSearchGroups, matchesOneGroup } from '@/lib/adminSearch';
import { useConfirm } from '@/components/admin/ConfirmProvider';
function AdminOrdersContent() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderTab>('all');
  const [multiStatusFilter, setMultiStatusFilter] = useState<OrderStatus[] | null>(null);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'this_month'>('all');
  // Put the list in an order, and show one stretch of days (Kieran, 2026-09-24: "alphabetical
  // order on name or a time line ie between x and y"). Both are worked out here in the browser,
  // because this screen already holds every order it is ever going to show.
  const [sort, setSort] = useState<OrderSort>('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // The product short names, handed down with the orders (see /api/admin/orders).
  const [searchAliases, setSearchAliases] = useState<string[][]>([]);

  // Reactively sync filters from URL — runs on every client-side navigation
  useEffect(() => {
    const param  = searchParams.get('status') ?? '';
    const period = searchParams.get('period');
    const srch   = searchParams.get('search') ?? '';
    setSearch(srch);
    setPeriodFilter(period === 'this_month' ? 'this_month' : 'all');
    if (param.includes(',')) {
      const parts = param.split(',').map(s => s.trim()).filter(s => (STATUS_OPTIONS as string[]).includes(s)) as OrderStatus[];
      setMultiStatusFilter(parts.length > 1 ? parts : null);
      setStatusFilter('all');
    } else if (param && (STATUS_OPTIONS as string[]).includes(param)) {
      setStatusFilter(param as OrderStatus);
      setMultiStatusFilter(null);
    } else {
      setStatusFilter('all');
      setMultiStatusFilter(null);
    }
  }, [searchParams]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Anything the site failed to do for this order. It was all being recorded already, but only on
  // System Health, so an order whose confirmation email never sent looked completely normal here.
  const [orderFailures, setOrderFailures] = useState<{ id: number; category: string; message: string; created_at: string }[]>([]);
  const [orderEmails, setOrderEmails] = useState<{ id: number; type: string | null; status: string | null; subject: string; sentAt: string; updatedAt: string | null }[]>([]);

  useEffect(() => {
    if (!selectedOrder) { setOrderFailures([]); setOrderEmails([]); return; }
    let cancelled = false;
    fetch(`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/failures`)
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d.failures)) setOrderFailures(d.failures); })
      .catch(() => {});
    fetch(`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/emails`)
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d.emails)) setOrderEmails(d.emails); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedOrder]);
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingEmailSent, setTrackingEmailSent] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendEmailResult, setResendEmailResult] = useState<{ orderNumber: string; ok: boolean } | null>(null);
  const [resendingOrderEmails, setResendingOrderEmails] = useState(false);
  const [resendOrderEmailsResult, setResendOrderEmailsResult] = useState<{ orderNumber: string; ok: boolean; message: string } | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvExportError, setCsvExportError] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markPaidResult, setMarkPaidResult] = useState<{ orderNumber: string; emailSent: boolean } | null>(null);
  // Brief disable window after a successful click, on top of the in-flight
  // `disabled={markingPaid}` — absorbs a rapid second click landing right as
  // the success state updates, so the button can't fire a duplicate email/
  // decrement in that gap. Keyed by order number so switching orders doesn't
  // carry a stale cooldown over.
  const [actionCooldown, setActionCooldown] = useState<{ key: string; orderNumber: string } | null>(null);
  function startCooldown(key: string, orderNumber: string, ms = 4000) {
    setActionCooldown({ key, orderNumber });
    setTimeout(() => setActionCooldown(prev => (prev?.key === key && prev.orderNumber === orderNumber ? null : prev)), ms);
  }
  function isOnCooldown(key: string, orderNumber: string) {
    return actionCooldown?.key === key && actionCooldown.orderNumber === orderNumber;
  }
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [deletingOrder, setDeletingOrder] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  /* The invoices standing in the way of a delete (task 8424c048).
   *
   * Kieran pressed Delete on an order, got "Deleted 0 orders... delete those invoices instead", and
   * reported the button as not working at all. It was working: an order that came from an invoice
   * is refused on purpose, because deleting it on its own used to leave the invoice pointing at an
   * order number that no longer existed (five of those were found live on 15 August 2026).
   *
   * What was missing is that the message told him what to do and then left him to go and do it: find
   * the invoice screen, find that invoice, delete it. Five steps on a phone. The refusal already
   * hands back the invoice id, so it is kept here and turned into a button that does the job. The
   * default is unchanged — a bare Delete still never removes a financial record on its own. */
  const [blockingInvoices, setBlockingInvoices] = useState<
    { orderNumber: string; invoiceNumber: string; invoiceId: number }[]
  >([]);
  const [deletingInvoice, setDeletingInvoice] = useState<number | null>(null);
  const [confirmInvoiceDelete, setConfirmInvoiceDelete] = useState<number | null>(null);

  /** Deletes the invoice, which takes its order with it. Said plainly on the button before it runs. */
  async function deleteBlockingInvoice(invoiceId: number, orderNumber: string) {
    setDeletingInvoice(invoiceId);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        setError(data?.error ?? 'The invoice could not be deleted. Please try again.');
        return;
      }
      setOrders(prev => prev.filter(o => o.orderNumber !== orderNumber));
      if (selectedOrder?.orderNumber === orderNumber) setSelectedOrder(null);
      setBlockingInvoices(prev => prev.filter(b => b.invoiceId !== invoiceId));
      setConfirmInvoiceDelete(null);
      setError('');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setDeletingInvoice(null);
    }
  }
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [creatingLabel, setCreatingLabel] = useState(false);
  const [labelActionError, setLabelActionError] = useState<{ orderNumber: string; message: string } | null>(null);
  const [markingDispatchedRM, setMarkingDispatchedRM] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/orders');
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.searchAliases)) setSearchAliases(data.searchAliases);
        setDbConfigured(data.dbConfigured !== false);
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch {
        if (!cancelled) setError('Could not load orders. Please refresh and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Archived orders (task 831a4461). Worked out here rather than stored, so the 7-day rule is
  // right the moment the screen is read and there is no nightly job to fall behind.
  const archiveOf = (o: Order) => orderArchiveState({
    status: o.status,
    deliveredAt: o.deliveredAt ?? null,
    archivedAt: o.archivedAt ?? null,
    dispatchedAt: o.dispatchedAt ?? null,
    paymentConfirmedAt: o.paymentConfirmedAt,
    createdAt: o.createdAt,
  });
  const archivedCount = orders.filter(o => archiveOf(o).archived).length;
  const viewingArchive = statusFilter === 'archived';

  // Searchable text, worked out once per load rather than on every keystroke: the list can run to
  // thousands of orders and this now reads the products and the address too.
  const searchIndex = useMemo(
    () => new Map(orders.map(o => [o.orderNumber, orderSearchText(o)])),
    [orders]
  );
  // Every word typed has to be found somewhere on the order, and they can be in different places,
  // which is what makes "Amber Reta" work. Each word carries its short names with it, so
  // "Retatrutide" also finds an order written down as "Reta 30mg". src/lib/adminSearch.ts has the
  // rules and src/lib/searchAliases.ts has the short names.
  const searchGroups = useMemo(() => parseSearchGroups(search, searchAliases), [search, searchAliases]);
  const isSearching = searchGroups.length > 0;

  const textFor = (o: Order) => searchIndex.get(o.orderNumber) ?? orderSearchText(o);
  const matchesOrderSearch = (o: Order) => matchesSearchGroups(textFor(o), searchGroups);

  const withinDateRange = (o: Order) => {
    if (!dateFrom && !dateTo) return true;
    const day = orderDayInUk(o);
    if (!day) return false;
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  };

  const matchesEverythingButArchive = (o: Order) => {
    const matchesStatus =
      multiStatusFilter !== null
        ? multiStatusFilter.includes(o.status)
        : statusFilter === 'all' || statusFilter === 'archived' || o.status === statusFilter;
    const matchesPeriod = periodFilter === 'all' || (() => {
      const orderDate = new Date(o.createdAt);
      const now = new Date();
      return orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === now.getMonth();
    })();
    return matchesOrderSearch(o) && matchesStatus && matchesPeriod && withinDateRange(o);
  };

  const filtered = sortOrders(
    orders.filter(o => {
      // The archive is a folder, not a filter on top of the others: with nothing typed, looking at
      // it shows everything in it and every other tab shows only what is NOT in it. That is the
      // whole point, which is to leave the working list as work.
      //
      // A SEARCH IS THE EXCEPTION, and this is the fault Kieran reported on 2026-09-25: he typed
      // "aod" and got an empty screen, because all five AOD orders were delivered weeks ago and had
      // archived themselves. Somebody typing a product name is asking "where is that order", not
      // "is that order in the folder I happen to be looking at". So a search reads both folders,
      // and the rows that came out of the archive say so.
      if (!isSearching && archiveOf(o).archived !== viewingArchive) return false;
      if (isSearching && viewingArchive && !archiveOf(o).archived) return false;
      return matchesEverythingButArchive(o);
    }),
    sort
  );

  /** Rows on screen that came out of Archived orders, so the table can label them. */
  const archivedOnScreen = new Set(
    isSearching && !viewingArchive ? filtered.filter(o => archiveOf(o).archived).map(o => o.orderNumber) : []
  );

  // Orders hidden by the date boxes rather than by the search, which the archive no longer hides.
  const matchesHiddenByArchive = (!isSearching && (dateFrom || dateTo))
    ? orders.filter(o => archiveOf(o).archived !== viewingArchive && matchesEverythingButArchive(o)).length
    : 0;

  /**
   * When a search finds nothing, how many orders each word would have found on its own. This is
   * the difference between "No orders match your search" and knowing that hgh has 12 and aod has 5
   * but no single order has both.
   */
  const wordBreakdown = (filtered.length === 0 && searchGroups.length > 1)
    ? searchGroups.map(group => ({
        word: group.typed,
        count: orders.filter(o => matchesOneGroup(textFor(o), group)).length,
      }))
    : [];

  // The list deliberately keeps unpaid attempts so staff can recover or
  // cancel them, but the headline is a sales figure and must count money that
  // was confirmed, not every press of the checkout button.
  const paidOrderCount = orders.filter(o => o.paymentConfirmedAt !== null).length;
  const awaitingPaymentCount = orders.filter(o => o.status === 'pending' || o.status === 'awaiting_payment').length;

  // Confirmation copy for status transitions made via the generic dropdown
  // that are either destructive (terminal, no way back) or risk an admin
  // accidentally using this path instead of the dedicated "Mark as Paid"
  // button — which also decrements stock for invoice orders, marks a linked
  // invoice paid, and sends the customer/admin emails. This dropdown only
  // triggers Royal Mail dispatch, nothing else, so jumping straight to
  // "Paid" here silently skips those other steps.
  async function confirmStatusChange(_from: OrderStatus, to: OrderStatus): Promise<boolean> {
    if (to === 'paid') {
      return confirm({
        title: 'Use "Mark as Paid" instead?',
        body: 'That button also takes the stock down for invoice orders, marks a linked invoice paid, and emails the customer.\n\nThis dropdown only changes the status and creates a Royal Mail label. It will NOT email the customer and will NOT take stock down.',
        confirmLabel: 'Continue anyway',
        cancelLabel: 'Go back',
      });
    }
    if (to === 'refunded') {
      return confirm({
        title: `Mark this order as ${STATUS_LABELS[to]}?`,
        body: 'This is a final status and cannot be undone from here.',
        confirmLabel: 'Yes, mark it',
        cancelLabel: 'Leave it',
        tone: 'danger',
      });
    }
    if (to === 'cancelled') {
      return confirm({
        title: 'Cancel this order?',
        body: "Its invoice is cancelled with it, so the customer's pay page stops offering payment.\n\nIf you need it back later, set it to Awaiting Payment.",
        confirmLabel: 'Yes, cancel it',
        cancelLabel: 'Leave it',
        tone: 'danger',
      });
    }
    return true;
  }

  // Shows the new status straight away, then makes the screen agree with what
  // was actually stored (task d0d5effb). It used to show the change and never
  // look at the answer beyond res.ok, so a status the server quietly refused
  // stayed on screen until the next reload put the old one back. That is what
  // "I marked it cancelled and it went back to awaiting payment" was.
  async function updateStatus(orderNumber: string, status: OrderStatus) {
    const previous = orders.find(o => o.orderNumber === orderNumber)?.status;
    setError('');
    setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, status } : o));
    if (selectedOrder?.orderNumber === orderNumber) setSelectedOrder(prev => prev ? { ...prev, status } : null);

    const revert = () => {
      if (!previous) return;
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, status: previous } : o));
      if (selectedOrder?.orderNumber === orderNumber) setSelectedOrder(prev => prev ? { ...prev, status: previous } : null);
    };

    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        revert();
        setError(data?.error || 'Could not save the status change. Please try again.');
        return;
      }
      // Believe the stored order, not the dropdown. If the server settled on a
      // different status (a label was created, say), the screen follows it.
      const saved = data?.order?.status as OrderStatus | undefined;
      if (saved && saved !== status) {
        setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, status: saved } : o));
        if (selectedOrder?.orderNumber === orderNumber) setSelectedOrder(prev => prev ? { ...prev, status: saved } : null);
      }
    } catch {
      revert();
      setError('Could not save the status change. Please try again.');
    }
  }

  async function updateTracking(orderNumber: string, trackingNumber: string) {
    setSavingTracking(true);
    setTrackingEmailSent(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error('Failed to update tracking');
      const newStatus = data?.order?.status as OrderStatus | undefined;
      const patch = { trackingNumber, ...(newStatus ? { status: newStatus } : {}) };
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, ...patch } : o));
      if (selectedOrder?.orderNumber === orderNumber) setSelectedOrder(prev => prev ? { ...prev, ...patch } : null);
      if (data?.emailSent) setTrackingEmailSent(orderNumber);
    } catch {
      setError('Could not save the tracking number. Please try again.');
    } finally {
      setSavingTracking(false);
    }
  }

  async function markOrderPaid(orderNumber: string, paidVia?: 'fena' | 'paypal') {
    setMarkingPaid(true);
    setMarkPaidResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/mark-paid`, {
        method: 'POST',
        headers: paidVia ? { 'Content-Type': 'application/json' } : undefined,
        body: paidVia ? JSON.stringify({ paidVia }) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error('Failed to mark as paid');
      const patch = { status: 'awaiting_dispatch' as OrderStatus };
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, ...patch } : o));
      setSelectedOrder(prev => prev?.orderNumber === orderNumber ? { ...prev, ...patch } : prev);
      setMarkPaidResult({ orderNumber, emailSent: Boolean(data?.emailSent) });
      startCooldown('mark-paid', orderNumber);
    } catch {
      setError('Could not mark the order as paid. Please try again.');
    } finally {
      setMarkingPaid(false);
    }
  }

  async function createRoyalMailLabel(orderNumber: string) {
    setCreatingLabel(true);
    setLabelActionError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/ship`, { method: 'POST' });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message = data?.error || 'Could not create the Royal Mail label.';
        setLabelActionError({ orderNumber, message });
        const patch = { royalMailLabelStatus: 'error' as RoyalMailLabelStatus, royalMailLabelError: message };
        setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, ...patch } : o));
        setSelectedOrder(prev => prev?.orderNumber === orderNumber ? { ...prev, ...patch } : prev);
        return;
      }

      const patch = {
        trackingNumber: data.trackingNumber as string,
        trackingUrl: data.trackingUrl as string,
        royalMailOrderId: data.royalMailOrderId as string,
        royalMailLabelStatus: 'created' as RoyalMailLabelStatus,
        royalMailLabelError: null,
        parcelWeightGrams: data.weightGrams as number,
        parcelPackageFormat: data.packageFormat as string,
      };
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, ...patch } : o));
      setSelectedOrder(prev => prev?.orderNumber === orderNumber ? { ...prev, ...patch } : prev);
    } catch {
      setLabelActionError({ orderNumber, message: 'Could not create the Royal Mail label. Please try again.' });
    } finally {
      setCreatingLabel(false);
    }
  }

  async function markDispatchedAndSendTracking(orderNumber: string) {
    setMarkingDispatchedRM(true);
    setTrackingEmailSent(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to mark dispatched');

      const patch = {
        status: 'dispatched' as OrderStatus,
        shippingEmailSentAt: data?.order?.shipping_email_sent_at ?? new Date().toISOString(),
      };
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, ...patch } : o));
      setSelectedOrder(prev => prev?.orderNumber === orderNumber ? { ...prev, ...patch } : prev);
      if (data?.emailSent) setTrackingEmailSent(orderNumber);
      startCooldown('dispatch', orderNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark the order as dispatched.');
    } finally {
      setMarkingDispatchedRM(false);
    }
  }

  async function downloadRoyalMailCSV(orderNumber: string) {
    setExportingCsv(true);
    setCsvExportError(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/csv`);
      if (!res.ok) throw new Error('Failed to generate CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${orderNumber}-royal-mail.csv`;
      link.click();
      URL.revokeObjectURL(url);

      const patch = { status: 'exported' as OrderStatus };
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, ...patch } : o));
      setSelectedOrder(prev => prev?.orderNumber === orderNumber ? { ...prev, ...patch } : prev);
    } catch {
      setCsvExportError('Could not generate the Royal Mail CSV. Please try again.');
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleDeleteOrder(orderNumber: string) {
    setDeletingOrder(true);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { method: 'DELETE' });
      if (!res.ok) {
        // The server refuses an order that came from an invoice, and says why.
        // Showing "please try again" over the top of that reason is how somebody
        // ends up pressing the button five times.
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not delete the order. Please try again.');
        // Kept so the message can carry a button that actually does it (task 8424c048).
        if (data?.invoiceId && data?.invoiceNumber) {
          setBlockingInvoices([{ orderNumber, invoiceNumber: data.invoiceNumber, invoiceId: data.invoiceId }]);
        }
        setDeleteConfirm(null);
        return;
      }
      setOrders(prev => prev.filter(o => o.orderNumber !== orderNumber));
      setSelectedOrder(null);
      setDeleteConfirm(null);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setDeletingOrder(false);
    }
  }

  function toggleSelect(orderNumber: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const allSelected = filtered.length > 0 && filtered.every(o => prev.has(o.orderNumber));
      const next = new Set(prev);
      filtered.forEach(o => allSelected ? next.delete(o.orderNumber) : next.add(o.orderNumber));
      return next;
    });
  }

  // Asking Royal Mail what it knows (task d912f632). One press, one request, every parcel.
  //
  // It reports whether Royal Mail has printed the label and whether it has taken the parcel. It
  // does NOT report delivery, because Click & Drop has no delivery status to give. The screen says
  // so out loud, because a tracking button that quietly guesses is worse than none.
  const [rmChecking, setRmChecking] = useState(false);
  const [rmMessage, setRmMessage] = useState('');
  const [rmError, setRmError] = useState('');

  async function refreshRoyalMail() {
    setRmChecking(true);
    setRmMessage('');
    setRmError('');
    try {
      const res = await fetch('/api/admin/orders/royal-mail-refresh', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not reach Royal Mail. Please try again.');
      setRmMessage(
        `Asked Royal Mail about ${data.checked} parcel${data.checked === 1 ? '' : 's'}. `
        + `${data.withParcel} handed over, ${data.printedOnly} labelled but not collected. `
        + `${data.updated} order${data.updated === 1 ? '' : 's'} updated.`
      );
      // Re-read the orders so the rows show what Royal Mail just said, rather than the screen
      // claiming an update it has not actually loaded.
      const fresh = await fetch('/api/admin/orders').then(r => r.json()).catch(() => null);
      if (fresh?.orders) setOrders(fresh.orders);
    } catch (e) {
      setRmError(e instanceof Error ? e.message : 'Could not reach Royal Mail. Please try again.');
    } finally {
      setRmChecking(false);
    }
  }

  // Moving the ticked orders in or out of Archived orders (task 831a4461). The list is updated from
  // what the server says it actually changed, not from what was asked for, so a partial failure can
  // never leave the screen claiming more than happened.
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState('');

  async function handleBulkArchive(archived: boolean) {
    const orderNumbers = Array.from(selectedIds);
    if (orderNumbers.length === 0) return;
    setArchiving(true);
    setArchiveError('');
    try {
      const res = await fetch('/api/admin/orders/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumbers, archived }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not move those orders. Please try again.');
      const stamp = archived ? new Date().toISOString() : null;
      setOrders(list => list.map(o => (orderNumbers.includes(o.orderNumber) ? { ...o, archivedAt: stamp } : o)));
      setSelectedIds(new Set());
      setSelectedOrder(null);
    } catch (e) {
      setArchiveError(e instanceof Error ? e.message : 'Could not move those orders. Please try again.');
    } finally {
      setArchiving(false);
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(orderNumber =>
          fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { method: 'DELETE' })
            .then(async res => ({
              orderNumber,
              ok: res.ok,
              // Kept so a skipped order can say which invoice it belongs to,
              // rather than being counted into an anonymous "3 could not be
              // deleted" that gives nobody anything to act on.
              ...(res.ok ? { invoiceNumber: null, invoiceId: null } : await (async () => {
                const body = await res.json().catch(() => null);
                return { invoiceNumber: body?.invoiceNumber ?? null, invoiceId: body?.invoiceId ?? null };
              })()),
            }))
            .catch(() => ({ orderNumber, ok: false, invoiceNumber: null, invoiceId: null }))
        )
      );
      const deletedIds = new Set(results.filter(r => r.ok).map(r => r.orderNumber));
      const invoiced = results.filter(r => !r.ok && r.invoiceNumber);
      const otherFailures = results.filter(r => !r.ok && !r.invoiceNumber);

      setOrders(prev => prev.filter(o => !deletedIds.has(o.orderNumber)));
      if (selectedOrder && deletedIds.has(selectedOrder.orderNumber)) setSelectedOrder(null);
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);

      // One button per invoice, so it is always clear which financial record is going.
      setBlockingInvoices(invoiced
        .filter(r => r.invoiceId && r.invoiceNumber)
        .map(r => ({ orderNumber: r.orderNumber, invoiceNumber: r.invoiceNumber as string, invoiceId: r.invoiceId as number })));

      if (invoiced.length > 0 || otherFailures.length > 0) {
        const parts = [`Deleted ${deletedIds.size} order${deletedIds.size === 1 ? '' : 's'}.`];
        if (invoiced.length > 0) {
          parts.push(
            `${invoiced.length} came from an invoice and were left alone (${invoiced.map(r => r.invoiceNumber).join(', ')}). Delete those invoices instead and the orders go with them.`
          );
        }
        if (otherFailures.length > 0) {
          parts.push(`${otherFailures.length} could not be deleted.`);
        }
        setError(parts.join(' '));
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  async function markOrderDelivered(orderNumber: string) {
    setMarkingDelivered(true);
    try {
      await updateStatus(orderNumber, 'delivered');
    } finally {
      setMarkingDelivered(false);
    }
  }

  async function resendDispatchEmail(orderNumber: string) {
    setResendingEmail(true);
    setResendEmailResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/resend-dispatch`, { method: 'POST' });
      setResendEmailResult({ orderNumber, ok: res.ok });
      if (res.ok) startCooldown('resend', orderNumber, 8000);
    } catch {
      setResendEmailResult({ orderNumber, ok: false });
    } finally {
      setResendingEmail(false);
    }
  }

  async function resendOrderEmails(orderNumber: string) {
    setResendingOrderEmails(true);
    setResendOrderEmailsResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/resend-order-emails`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setResendOrderEmailsResult({ orderNumber, ok: res.ok, message: data.message || data.error || (res.ok ? 'Sent.' : 'Failed.') });
      if (res.ok) startCooldown('resend-order-emails', orderNumber, 10000);
    } catch {
      setResendOrderEmailsResult({ orderNumber, ok: false, message: 'Network error.' });
    } finally {
      setResendingOrderEmails(false);
    }
  }

  // Send the customer their payment link again (task d0d5effb). The link comes
  // back as well as going out, because the person pressing this is usually
  // already halfway through replying to the customer by hand and needs to paste
  // it. A long cooldown: this one lands in a customer's inbox.
  const [resendingPaymentLink, setResendingPaymentLink] = useState(false);
  const [paymentLinkResult, setPaymentLinkResult] = useState<
    { orderNumber: string; ok: boolean; message: string; paymentUrl?: string } | null
  >(null);

  async function resendPaymentLink(orderNumber: string, via: 'fena' | 'paypal') {
    setResendingPaymentLink(true);
    setPaymentLinkResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/resend-payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ via }),
      });
      const data = await res.json().catch(() => ({}));
      setPaymentLinkResult({
        orderNumber,
        ok: res.ok,
        message: data.message || data.error || (res.ok ? 'Sent.' : 'That did not work.'),
        // A failed send can still carry a working link, so keep it either way.
        paymentUrl: typeof data.paymentUrl === 'string' ? data.paymentUrl : undefined,
      });
      if (res.ok) startCooldown('resend-payment-link', orderNumber, 10000);
    } catch {
      setPaymentLinkResult({ orderNumber, ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setResendingPaymentLink(false);
  }
  }

  async function saveNotes(orderNumber: string) {
    setSavingNotes(true);
    const notes = notesDraft[orderNumber] ?? (orders.find(o => o.orderNumber === orderNumber)?.adminNotes || '');
    try {
      await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, adminNotes: notes } : o));
      if (selectedOrder?.orderNumber === orderNumber) setSelectedOrder(prev => prev ? { ...prev, adminNotes: notes } : null);
    } finally {
      setSavingNotes(false);
    }
  }


  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      {/* overflow-clip, not overflow-y-auto: `auto` makes this a scrolling box, and a
          sticky child attaches to the nearest scrolling box rather than the page. This
          box never actually scrolls (it grows to fit the list; the document is what
          scrolls), so the pinned filter bar inside would pin itself to something that
          never moves. Same reasoning as the products page and SiteChrome — measured in
          commit 307b332. The orders table keeps its own overflow-x-auto, so wide rows
          still slide sideways. */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">
                {viewingArchive ? 'Archived orders' : 'Orders'}
              </h1>
              <p className="text-xs text-stone-400">
                {!dbConfigured
                  ? 'Database not connected — orders cannot be recorded yet.'
                  // On the archive, count the archive. The shop-wide total read as though all 83
                  // orders were in here, which they are not (task 831a4461).
                  : viewingArchive
                    ? `${archivedCount} order${archivedCount === 1 ? '' : 's'} put away. ${orders.length - archivedCount} still on the working list.`
                    : `${paidOrderCount} paid order${paidOrderCount === 1 ? '' : 's'}.${awaitingPaymentCount > 0 ? ` ${awaitingPaymentCount} payment attempt${awaitingPaymentCount === 1 ? ' is' : 's are'} still awaiting payment.` : ''}`}
              </p>
            </div>
            {error && (
              <p className="text-[10px] text-red-400 border border-red-100 bg-red-50 px-3 py-1.5">{error}</p>
            )}

            {/* The way out of that message (task 8424c048). It says what it will delete before it
                does it, because an invoice is a financial record and it should never go without
                somebody meaning it to. */}
            {blockingInvoices.map(block => (
              <div key={block.invoiceId} className="border border-gold-200 bg-gold-50/50 px-3 py-2.5">
                {confirmInvoiceDelete === block.invoiceId ? (
                  <>
                    <p className="text-[10px] text-stone-700 mb-2">
                      This deletes invoice <span className="font-semibold">{block.invoiceNumber}</span> and
                      order <span className="font-semibold">{block.orderNumber}</span> with it. It cannot be undone.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => deleteBlockingInvoice(block.invoiceId, block.orderNumber)}
                        disabled={deletingInvoice === block.invoiceId}
                        className="bg-red-600 text-white text-[9px] tracking-[0.15em] uppercase px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        {deletingInvoice === block.invoiceId ? 'Deleting…' : 'Yes, delete both'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmInvoiceDelete(null)}
                        className="text-[9px] tracking-[0.15em] uppercase text-stone-500 px-3 py-2 hover:text-stone-700"
                      >
                        Keep them
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] text-stone-600 flex-1 min-w-[180px]">
                      Order {block.orderNumber} came from invoice {block.invoiceNumber}.
                    </p>
                    <button
                      type="button"
                      onClick={() => setConfirmInvoiceDelete(block.invoiceId)}
                      className="shrink-0 border border-red-300 text-red-600 text-[9px] tracking-[0.15em] uppercase px-4 py-2 hover:bg-red-50 transition-colors"
                    >
                      Delete invoice {block.invoiceNumber} and the order
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* What the archive is, said once, where somebody opening it would look. A folder
              things vanish into with no explanation is worse than no folder (task 831a4461). */}
          {viewingArchive && (
            <p className="text-[11px] text-stone-500 leading-relaxed mb-4 border border-stone-200 bg-stone-50 px-4 py-3">
              Orders come here on their own once they have been marked delivered for more than 7 days,
              and you can send any order here yourself by ticking it and pressing Move to archived
              orders. Nothing is deleted: everything in here is still a full order, and Bring back to
              orders puts it where it was.
            </p>
          )}

          <OrderFilters
            archivedCount={archivedCount}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            multiStatusFilter={multiStatusFilter}
            setMultiStatusFilter={setMultiStatusFilter}
            periodFilter={periodFilter}
            setPeriodFilter={setPeriodFilter}
            search={search}
            setSearch={setSearch}
            sort={sort}
            setSort={setSort}
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
            matchesHiddenByArchive={matchesHiddenByArchive}
            viewingArchive={viewingArchive}
            wordBreakdown={wordBreakdown}
            archivedShown={archivedOnScreen.size}
          />

          {/* Royal Mail's own record, on demand (task d912f632). Above the list, because it is
              about all of them rather than any one of them. */}
          <div className="mb-4 border border-stone-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.18em] uppercase text-stone-500 font-semibold">Royal Mail</p>
                <p className="text-[11px] text-stone-500 leading-relaxed mt-0.5">
                  Asks Royal Mail whether it has printed each label and taken each parcel, and writes
                  the answer onto the orders. It covers your most recent parcels, which is all Royal
                  Mail will hand back in one go. It cannot tell you a parcel has been delivered:
                  Royal Mail does not give this shop that, so nothing here will ever claim it.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshRoyalMail}
                disabled={rmChecking}
                className="shrink-0 bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
              >
                {rmChecking ? 'Asking Royal Mail…' : 'Update Royal Mail status'}
              </button>
            </div>
            {rmMessage && <p className="mt-2.5 text-[11px] text-stone-600">{rmMessage}</p>}
            {rmError && <p className="mt-2.5 text-[11px] text-red-600 font-semibold">{rmError}</p>}
          </div>

          <BulkSelectionToolbar
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            bulkDeleteConfirm={bulkDeleteConfirm}
            setBulkDeleteConfirm={setBulkDeleteConfirm}
            bulkDeleting={bulkDeleting}
            handleBulkDelete={handleBulkDelete}
            viewingArchive={viewingArchive}
            archiving={archiving}
            archiveError={archiveError}
            handleBulkArchive={handleBulkArchive}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <OrdersTable
              loading={loading}
              orders={orders}
              filtered={filtered}
              archivedOnScreen={archivedOnScreen}
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              toggleSelectAll={toggleSelectAll}
              setDeleteConfirm={setDeleteConfirm}
            />

            <OrderDetailPanel
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              orderFailures={orderFailures}
              orderEmails={orderEmails}
              orderActions={selectedOrder ? (
                <OrderActions
                  selectedOrder={selectedOrder}
                  isOnCooldown={isOnCooldown}
                  confirmStatusChange={confirmStatusChange}
                  updateStatus={updateStatus}
                  markOrderPaid={markOrderPaid}
                  markingPaid={markingPaid}
                  markPaidResult={markPaidResult}
                  createRoyalMailLabel={createRoyalMailLabel}
                  creatingLabel={creatingLabel}
                  labelActionError={labelActionError}
                  markDispatchedAndSendTracking={markDispatchedAndSendTracking}
                  markingDispatchedRM={markingDispatchedRM}
                  downloadRoyalMailCSV={downloadRoyalMailCSV}
                  exportingCsv={exportingCsv}
                  csvExportError={csvExportError}
                  updateTracking={updateTracking}
                  savingTracking={savingTracking}
                  trackingEmailSent={trackingEmailSent}
                  markOrderDelivered={markOrderDelivered}
                  markingDelivered={markingDelivered}
                  resendOrderEmails={resendOrderEmails}
                  resendingOrderEmails={resendingOrderEmails}
                  resendOrderEmailsResult={resendOrderEmailsResult}
                  resendPaymentLink={resendPaymentLink}
                  resendingPaymentLink={resendingPaymentLink}
                  paymentLinkResult={paymentLinkResult}
                  resendDispatchEmail={resendDispatchEmail}
                  resendingEmail={resendingEmail}
                  resendEmailResult={resendEmailResult}
                  setNotesDraft={setNotesDraft}
                  saveNotes={saveNotes}
                  savingNotes={savingNotes}
                  deleteConfirm={deleteConfirm}
                  setDeleteConfirm={setDeleteConfirm}
                  deletingOrder={deletingOrder}
                  handleDeleteOrder={handleDeleteOrder}
                />
              ) : null}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <AdminOrdersContent />
    </Suspense>
  );
}
