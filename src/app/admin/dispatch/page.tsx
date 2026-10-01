'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DispatchCalendar from '@/components/admin/DispatchCalendar';
import AdminSidebar from '@/components/admin/AdminSidebar';

// ── Royal Mail Dispatch (primary system) ──────────────────────────────────

import RoyalMailConnectionStatus from './RoyalMailConnectionStatus';
import ShippingSettingsPanel from './ShippingSettingsPanel';
import DispatchOrderList from './DispatchOrderList';
import ExportStep from './ExportStep';
import TrackingStep from './TrackingStep';
import {
  DISPATCH_READY_STATUSES,
  parseTrackingContent,
  type DispatchOrderStatus,
  type RMOrder,
  type RoyalMailStats,
  type ShippingSettings,
  type ExportGroup,
  type TrackOrder,
} from './dispatchTypes';
export default function DispatchPage() {
  // ── Royal Mail Dispatch state ──────────────────────────────────────────
  const [rmOrders, setRmOrders] = useState<RMOrder[]>([]);
  const [rmLoading, setRmLoading] = useState(true);
  const [royalMailConfigured, setRoyalMailConfigured] = useState(false);
  const [royalMailLiveMode, setRoyalMailLiveMode] = useState(false);
  const [royalMailStats, setRoyalMailStats] = useState<RoyalMailStats | null>(null);
  const [rmStatusFilter, setRmStatusFilter] = useState<DispatchOrderStatus | 'all'>('all');
  const [creatingLabel, setCreatingLabel] = useState<Record<string, boolean>>({});
  const [labelErrors, setLabelErrors] = useState<Record<string, string>>({});
  const [markingDispatched, setMarkingDispatched] = useState<Record<string, boolean>>({});
  const [dispatchedEmailSent, setDispatchedEmailSent] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  /* The invoice standing in the way of a delete, per order (task 8424c048). */
  const [blockingInvoice, setBlockingInvoice] = useState<Record<string, { invoiceNumber: string; invoiceId: number }>>({});
  const [confirmInvoiceDelete, setConfirmInvoiceDelete] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<string | null>(null);

  /** Deletes the invoice, which takes its order with it. */
  async function deleteBlockingInvoice(orderNumber: string) {
    const block = blockingInvoice[orderNumber];
    if (!block) return;
    setDeletingInvoice(orderNumber);
    try {
      const res = await fetch(`/api/admin/invoices/${block.invoiceId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        setLabelErrors(prev => ({ ...prev, [orderNumber]: data?.error ?? 'The invoice could not be deleted. Please try again.' }));
        return;
      }
      /* Reload rather than filter one list. This screen holds THREE: the Royal Mail orders, the
       * ones waiting to be exported, and the ones waiting for tracking. Filtering only the first
       * left a deleted order still sitting on screen under "to export", which looks exactly like
       * the delete having failed — the very complaint this task started from. Found by deleting a
       * real test order here and watching the row stay put while the database said it had gone. */
      setRmOrders(prev => prev.filter(o => o.orderNumber !== orderNumber));
      await load();
      setBlockingInvoice(prev => { const next = { ...prev }; delete next[orderNumber]; return next; });
      setLabelErrors(prev => { const next = { ...prev }; delete next[orderNumber]; return next; });
      setConfirmInvoiceDelete(null);
    } catch {
      setLabelErrors(prev => ({ ...prev, [orderNumber]: 'Could not reach the server. Please try again.' }));
    } finally {
      setDeletingInvoice(null);
    }
  }
  const [deletingOrder, setDeletingOrder] = useState<Record<string, boolean>>({});
  const [manualTrackingInputs, setManualTrackingInputs] = useState<Record<string, string>>({});
  const [savingManualTracking, setSavingManualTracking] = useState<Record<string, boolean>>({});
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncNowResult, setSyncNowResult] = useState<{ checked: number; dispatched: number } | null>(null);

  const [settingsDraft, setSettingsDraft] = useState<ShippingSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Legacy manual CSV flow is collapsed by default — the automatic Royal
  // Mail system above is the day-to-day path.
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [toExport, setToExport] = useState<ExportGroup[]>([]);
  const [toTrack, setToTrack] = useState<TrackOrder[]>([]);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [csvDownloading, setCsvDownloading] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResults, setSaveResults] = useState<Record<string, { success: boolean; emailSent: boolean; error?: string }>>({});

  // Smart import state
  const [importText, setImportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ matched: number; unmatched: string[]; strategy: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/dispatch/pending');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setToExport(data.toExport ?? []);
      setToTrack(data.toTrack ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadRmOrders = useCallback(async () => {
    setRmLoading(true);
    try {
      const res = await fetch('/api/admin/orders');
      const data = await res.json();
      setRoyalMailConfigured(Boolean(data.royalMailConfigured));
      setRoyalMailLiveMode(Boolean(data.royalMailLiveMode));
      setRoyalMailStats(data.royalMailStats ?? null);
      const orders = (Array.isArray(data.orders) ? data.orders : []) as RMOrder[];
      // Orders awaiting dispatch, plus the 10 most recently dispatched (for
      // re-downloading labels / resending tracking) — orders are already
      // sorted newest-first by the API.
      const ready = orders.filter(o => DISPATCH_READY_STATUSES.includes(o.status));
      const recentDispatched = orders.filter(o => o.status === 'dispatched').slice(0, 10);
      setRmOrders([...ready, ...recentDispatched]);
    } catch {
      // silent
    } finally {
      setRmLoading(false);
    }
  }, []);

  useEffect(() => { loadRmOrders(); }, [loadRmOrders]);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const res = await fetch('/api/admin/shipping-settings');
        const data = await res.json();
        if (cancelled) return;
        if (data.settings) {
          setSettingsDraft(data.settings);
        }
      } catch {
        // silent
      }
    }
    loadSettings();
    return () => { cancelled = true; };
  }, []);

  async function saveSettings() {
    if (!settingsDraft) return;
    setSettingsSaving(true);
    setSettingsSaved(false);
    setSettingsError(null);
    try {
      const res = await fetch('/api/admin/shipping-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsDraft),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to save shipping settings.');
      setSettingsDraft(data.settings);
      setSettingsSaved(true);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save shipping settings.');
    } finally {
      setSettingsSaving(false);
    }
  }

  // On-demand equivalent of the once-daily Royal Mail cron sync (Vercel's
  // Hobby plan caps scheduled crons at once per day) — lets an admin pick up
  // a tracking number immediately after applying postage in Click & Drop,
  // or retry a transient API error, without waiting for the next 06:00 run.
  async function syncNow() {
    setSyncingNow(true);
    setSyncNowResult(null);
    try {
      const res = await fetch('/api/admin/dispatch/sync-now', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setSyncNowResult({ checked: data.checked, dispatched: data.dispatched });
        loadRmOrders();
      }
    } finally {
      setSyncingNow(false);
    }
  }

  async function createLabel(orderNumber: string) {
    setCreatingLabel(prev => ({ ...prev, [orderNumber]: true }));
    setLabelErrors(prev => { const next = { ...prev }; delete next[orderNumber]; return next; });
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/ship`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data?.error || 'Could not create the Royal Mail label.';
        const pending = Boolean(data?.pending);
        // The pending-postage explanation is shown via its own dedicated box
        // below (using royalMailLabelError) — only genuine failures go into
        // the shared labelErrors banner, so the same message isn't shown twice.
        if (!pending) setLabelErrors(prev => ({ ...prev, [orderNumber]: message }));
        setRmOrders(prev => prev.map(o => o.orderNumber === orderNumber
          ? {
              ...o,
              royalMailLabelStatus: pending ? 'pending_postage' : 'error',
              royalMailLabelError: message,
              royalMailOrderId: data?.royalMailOrderId ?? o.royalMailOrderId,
            }
          : o));
        return;
      }
      setRmOrders(prev => prev.map(o => o.orderNumber === orderNumber
        ? {
            ...o,
            trackingNumber: data.trackingNumber,
            trackingUrl: data.trackingUrl,
            royalMailOrderId: data.royalMailOrderId ?? o.royalMailOrderId,
            royalMailLabelStatus: 'created',
            royalMailLabelError: null,
            parcelWeightGrams: data.weightGrams,
            parcelPackageFormat: data.packageFormat,
          }
        : o));
    } catch {
      setLabelErrors(prev => ({ ...prev, [orderNumber]: 'Could not create the Royal Mail label. Please try again.' }));
    } finally {
      setCreatingLabel(prev => ({ ...prev, [orderNumber]: false }));
    }
  }

  // Fallback for when Royal Mail's API never exposes a tracking number even
  // after postage has been paid manually in Click & Drop — saves a pasted
  // tracking number directly against the order, which flips it into the
  // same "Label Created" UI branch as an API-created label.
  async function saveManualTracking(orderNumber: string) {
    const trackingNumber = manualTrackingInputs[orderNumber]?.trim();
    if (!trackingNumber) return;
    setSavingManualTracking(prev => ({ ...prev, [orderNumber]: true }));
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/manual-tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not save the tracking number.');
      setRmOrders(prev => prev.map(o => o.orderNumber === orderNumber
        ? { ...o, trackingNumber: data.trackingNumber, trackingUrl: data.trackingUrl, royalMailLabelStatus: 'created', royalMailLabelError: null }
        : o));
      setManualTrackingInputs(prev => { const next = { ...prev }; delete next[orderNumber]; return next; });
    } catch (err) {
      setLabelErrors(prev => ({ ...prev, [orderNumber]: err instanceof Error ? err.message : 'Could not save the tracking number.' }));
    } finally {
      setSavingManualTracking(prev => ({ ...prev, [orderNumber]: false }));
    }
  }

  async function markDispatched(orderNumber: string) {
    setMarkingDispatched(prev => ({ ...prev, [orderNumber]: true }));
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Failed to mark dispatched');

      setRmOrders(prev => prev.map(o => o.orderNumber === orderNumber
        ? { ...o, status: 'dispatched', shippingEmailSentAt: data?.order?.shipping_email_sent_at ?? new Date().toISOString() }
        : o));
      if (data?.emailSent) setDispatchedEmailSent(prev => new Set(prev).add(orderNumber));
    } catch {
      setLabelErrors(prev => ({ ...prev, [orderNumber]: 'Could not mark the order as dispatched. Please try again.' }));
    } finally {
      setMarkingDispatched(prev => ({ ...prev, [orderNumber]: false }));
    }
  }

  // Deletes an order outright — for early test/experiment orders that never
  // need to be fulfilled (e.g. ones stuck in a permanent Label Error state).
  // Same DELETE endpoint and confirm-before-delete pattern as /admin/orders.
  async function handleDeleteOrder(orderNumber: string) {
    setDeletingOrder(prev => ({ ...prev, [orderNumber]: true }));
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}`, { method: 'DELETE' });
      if (!res.ok) {
        /* An order that came from an invoice is refused on purpose: deleting it on its own used to
         * leave the invoice pointing at an order that no longer existed. Naming the invoice was not
         * enough though — Kieran reported the button as "doesn't work at all", because it told him
         * what to do and then left him to go and find the invoice himself (task 8424c048). The id
         * is kept so the message can carry a button that does it. */
        const data = await res.json().catch(() => null);
        setLabelErrors(prev => ({ ...prev, [orderNumber]: data?.error ?? 'Could not delete the order. Please try again.' }));
        if (data?.invoiceId && data?.invoiceNumber) {
          setBlockingInvoice(prev => ({ ...prev, [orderNumber]: { invoiceNumber: data.invoiceNumber, invoiceId: data.invoiceId } }));
        }
        setDeleteConfirm(null);
        return;
      }
      /* Reload rather than filter one list. This screen holds THREE: the Royal Mail orders, the
       * ones waiting to be exported, and the ones waiting for tracking. Filtering only the first
       * left a deleted order still sitting on screen under "to export", which looks exactly like
       * the delete having failed — the very complaint this task started from. Found by deleting a
       * real test order here and watching the row stay put while the database said it had gone. */
      setRmOrders(prev => prev.filter(o => o.orderNumber !== orderNumber));
      await load();
      setDeleteConfirm(null);
    } catch {
      setLabelErrors(prev => ({ ...prev, [orderNumber]: 'Could not reach the server. Please try again.' }));
    } finally {
      setDeletingOrder(prev => ({ ...prev, [orderNumber]: false }));
    }
  }

  function downloadCSV(date: string) {
    setCsvDownloading(prev => new Set(prev).add(date));
    window.location.href = `/api/admin/dispatch/csv?date=${date}`;
    setTimeout(() => {
      load();
      setCsvDownloading(prev => { const s = new Set(prev); s.delete(date); return s; });
    }, 3000);
  }

  function applyImport(content: string) {
    const { matches, strategy } = parseTrackingContent(content);
    if (Object.keys(matches).length === 0) {
      setImportFeedback({ matched: 0, unmatched: [], strategy: 'none' });
      return;
    }

    const knownOrders = new Set(toTrack.map(o => o.orderNumber));
    let matched = 0;
    const unmatched: string[] = [];

    const newInputs = { ...trackingInputs };
    for (const [orderNum, tracking] of Object.entries(matches)) {
      if (knownOrders.has(orderNum)) {
        newInputs[orderNum] = tracking;
        matched++;
      } else {
        unmatched.push(orderNum);
      }
    }

    setTrackingInputs(newInputs);
    setImportFeedback({ matched, unmatched, strategy });
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      setImportText(content);
      applyImport(content);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  async function saveAllTracking() {
    const entries = toTrack
      .filter(o => trackingInputs[o.orderNumber]?.trim())
      .map(o => ({ orderNumber: o.orderNumber, trackingNumber: trackingInputs[o.orderNumber].trim() }));

    if (!entries.length) return;

    setSaving(true);
    setSaveResults({});

    try {
      const res = await fetch('/api/admin/dispatch/bulk-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      });
      const data = await res.json();
      const results: Record<string, { success: boolean; emailSent: boolean; error?: string }> = {};
      for (const r of data.results ?? []) {
        results[r.orderNumber] = r;
      }
      setSaveResults(results);

      const dispatched = new Set<string>(
        (data.results ?? []).filter((r: { success: boolean }) => r.success).map((r: { orderNumber: string }) => r.orderNumber)
      );
      setToTrack(prev => prev.filter(o => !dispatched.has(o.orderNumber)));
      setTrackingInputs(prev => {
        const next = { ...prev };
        dispatched.forEach(n => delete next[n]);
        return next;
      });
      setImportFeedback(null);
      setImportText('');
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  const filledTrackingCount = toTrack.filter(o => trackingInputs[o.orderNumber]?.trim()).length;

  const filteredRmOrders = rmOrders.filter(o => {
    if (rmStatusFilter === 'all') return DISPATCH_READY_STATUSES.includes(o.status);
    return o.status === rmStatusFilter;
  });

  const rmFilterCounts = {
    all: rmOrders.filter(o => DISPATCH_READY_STATUSES.includes(o.status)).length,
    paid: rmOrders.filter(o => o.status === 'paid').length,
    awaiting_dispatch: rmOrders.filter(o => o.status === 'awaiting_dispatch').length,
    processing: rmOrders.filter(o => o.status === 'processing').length,
    exported: rmOrders.filter(o => o.status === 'exported').length,
    dispatched: rmOrders.filter(o => o.status === 'dispatched').length,
  };

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">

          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Dispatch Centre</h1>
              <p className="text-xs text-stone-400">
                Create Royal Mail labels and send tracking emails, with a manual CSV system as backup.
              </p>
            </div>
            <button
              onClick={() => { load(); loadRmOrders(); }}
              disabled={loading || rmLoading}
              className="shrink-0 text-[9px] tracking-[0.18em] uppercase text-stone-400 hover:text-gold-700 border border-stone-200 hover:border-gold-300 disabled:opacity-50 px-3 py-2 transition-colors"
            >
              {loading || rmLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* ── Royal Mail Dispatch (primary system) ────────────────────── */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-6 h-6 rounded-full bg-gold-700 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-.5a.5.5 0 0 0-.5.5v.217l6.5 3.9 6.5-3.9V4a.5.5 0 0 0-.5-.5H2zm13 1.717-6.5 3.9-6.5-3.9V12a.5.5 0 0 0 .5.5h12a.5.5 0 0 0 .5-.5V5.217z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-stone-700 tracking-wide">Royal Mail Dispatch</h2>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Create labels, download postage documents, and send tracking emails directly through the Royal Mail Click &amp; Drop API.
                </p>
              </div>
            </div>

            {!royalMailConfigured && (
              <div className="border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  Royal Mail isn&apos;t connected yet — add <code className="font-mono">ROYAL_MAIL_API_KEY</code> to
                  the environment variables to enable label creation here. The Manual CSV / Fallback
                  Dispatch System below still works without it.
                </p>
              </div>
            )}

            <RoyalMailConnectionStatus
              royalMailConfigured={royalMailConfigured}
              royalMailLiveMode={royalMailLiveMode}
              royalMailStats={royalMailStats}
              syncNow={syncNow}
              syncingNow={syncingNow}
              syncNowResult={syncNowResult}
            />

            <ShippingSettingsPanel
              settingsOpen={settingsOpen}
              setSettingsOpen={setSettingsOpen}
              settingsDraft={settingsDraft}
              setSettingsDraft={setSettingsDraft}
              saveSettings={saveSettings}
              settingsSaving={settingsSaving}
              settingsSaved={settingsSaved}
              settingsError={settingsError}
            />

            <DispatchOrderList
              rmStatusFilter={rmStatusFilter}
              setRmStatusFilter={setRmStatusFilter}
              rmFilterCounts={rmFilterCounts}
              rmLoading={rmLoading}
              filteredRmOrders={filteredRmOrders}
              royalMailConfigured={royalMailConfigured}
              createLabel={createLabel}
              creatingLabel={creatingLabel}
              labelErrors={labelErrors}
              blockingInvoice={blockingInvoice}
              confirmInvoiceDelete={confirmInvoiceDelete}
              setConfirmInvoiceDelete={setConfirmInvoiceDelete}
              deleteBlockingInvoice={deleteBlockingInvoice}
              deletingInvoice={deletingInvoice}
              markDispatched={markDispatched}
              markingDispatched={markingDispatched}
              dispatchedEmailSent={dispatchedEmailSent}
              manualTrackingInputs={manualTrackingInputs}
              setManualTrackingInputs={setManualTrackingInputs}
              saveManualTracking={saveManualTracking}
              savingManualTracking={savingManualTracking}
              deleteConfirm={deleteConfirm}
              setDeleteConfirm={setDeleteConfirm}
              deletingOrder={deletingOrder}
              handleDeleteOrder={handleDeleteOrder}
            />
          </section>

          {/* ── Manual CSV / Fallback Dispatch System ───────────────────── */}
          <div className="mb-4 border border-stone-200 bg-stone-50">
            <button
              type="button"
              onClick={() => setFallbackOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
            >
              <div>
                <h2 className="text-sm font-semibold text-stone-700 tracking-wide">Manual Backup System (CSV)</h2>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Only needed if the automatic Royal Mail system above is down. Everything below is the old
                  manual route: export a CSV, upload it to Click &amp; Drop yourself, paste tracking numbers back in.
                </p>
              </div>
              <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400 shrink-0 ml-4">{fallbackOpen ? 'Hide' : 'Show'}</span>
            </button>
          </div>
          {fallbackOpen && (<>

          {/* ── Order Calendar ──────────────────────────────────────────── */}
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-6 h-6 rounded-full bg-stone-400 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 1a1 1 0 0 1 2 0v1h4V1a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1V1zM3 6v7h10V6H3z"/>
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-stone-700 tracking-wide">Order Calendar</h2>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  Click any day to see who ordered, what they bought, and the order status.
                </p>
              </div>
            </div>
            <DispatchCalendar onExported={load} />
          </section>

          {loading ? (
            <p className="text-xs text-stone-400">Loading dispatch queue...</p>
          ) : (
            <>
              <ExportStep
                toExport={toExport}
                downloadCSV={downloadCSV}
                csvDownloading={csvDownloading}
              />

              <TrackingStep
                toTrack={toTrack}
                toExport={toExport}
                trackingInputs={trackingInputs}
                setTrackingInputs={setTrackingInputs}
                filledTrackingCount={filledTrackingCount}
                saveAllTracking={saveAllTracking}
                saving={saving}
                saveResults={saveResults}
                importText={importText}
                setImportText={setImportText}
                applyImport={applyImport}
                importFeedback={importFeedback}
                dragOver={dragOver}
                setDragOver={setDragOver}
                handleDrop={handleDrop}
                handleFileUpload={handleFileUpload}
                fileInputRef={fileInputRef}
              />
            </>
          )}
          </>)}
        </div>
      </main>
    </div>
  );
}
