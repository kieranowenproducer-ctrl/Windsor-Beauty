'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PRODUCTS, mergeProducts, type Product } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';

import ResendNotice from './ResendNotice';
import InvoiceCustomer from './InvoiceCustomer';
import InvoiceAddresses from './InvoiceAddresses';
import InvoiceDatesAndText from './InvoiceDatesAndText';
import InvoiceLineItems from './InvoiceLineItems';
import InvoiceTotals from './InvoiceTotals';
import FulfilmentAndPayment from './FulfilmentAndPayment';
import MarkPaidPanel from './MarkPaidPanel';
import InvoiceActions from './InvoiceActions';
import { useConfirm, type ConfirmOptions } from '@/components/admin/ConfirmProvider';
import {
  STATUS_TONE,
  DEFAULT_AUTOMATION_FLAGS,
  emptyLineItem,
  roundMoney,
  computeLineTotal,
  formatDateInput,
  normalizeCountry,
  type InvoiceLineItem,
  type TrialPick,
  type CustomerMatch,
  type InvoiceRow,
  type PaymentMethod,
  type FulfilmentType,
  type AutomationFlags,
} from './invoiceEditTypes';
export default function AdminInvoiceEditPage() {
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [loadError, setLoadError] = useState('');

  // Customer / company
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');

  // Customer lookup: search existing members / past customers and prefill the
  // fields below, so an admin does not retype details we already hold.
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerMatch[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);

  // Addresses
  const [billingLine1, setBillingLine1] = useState('');
  const [billingLine2, setBillingLine2] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingPostcode, setBillingPostcode] = useState('');
  const [billingCountry, setBillingCountry] = useState('GB');
  const [shipDifferent, setShipDifferent] = useState(false);
  const [shippingLine1, setShippingLine1] = useState('');
  const [shippingLine2, setShippingLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingPostcode, setShippingPostcode] = useState('');
  const [shippingCountry, setShippingCountry] = useState('GB');
  // Whether this parcel goes to somebody other than the person being invoiced, and their name.
  // Nothing to do with who owes the money (task 77b818aa).
  const [sendToSomeoneElse, setSendToSomeoneElse] = useState(false);
  const [shippingRecipient, setShippingRecipient] = useState('');

  // Dates / text
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [footerText, setFooterText] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // Line items / totals
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([emptyLineItem()]);
  const [shippingLabel, setShippingLabel] = useState('UK Delivery');
  const [shippingAmount, setShippingAmount] = useState('0');
  const [discountCode, setDiscountCode] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [applyCodeStatus, setApplyCodeStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [applyCodeMessage, setApplyCodeMessage] = useState('');

  // Paid-invoice adjustment override
  const [adjusting, setAdjusting] = useState(false);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  const [saving, setSaving] = useState(false);

  /* Auto-save for drafts (task de561135). `lastSavedRef` is what the server has confirmed it
     holds; anything different from it is work that exists only in this browser. */
  const [hydrated, setHydrated] = useState(false);
  const lastSavedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paypalNote, setPaypalNote] = useState('');
  const [markingPaypalPaid, setMarkingPaypalPaid] = useState(false);
  const [paypalResult, setPaypalResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Fulfilment & Payment
  const [intendedPaymentMethod, setIntendedPaymentMethod] = useState<PaymentMethod>('fena');
  const [fulfilmentType, setFulfilmentType] = useState<FulfilmentType>('royal_mail');
  const [automationFlags, setAutomationFlags] = useState<AutomationFlags>(DEFAULT_AUTOMATION_FLAGS);

  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string>>(new Set());
  const products = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  // The catalogue picker lists only LIVE products (not hidden, not placeholder
  // drafts) in alphabetical order — so a bespoke invoice can only pull in things
  // that actually exist on the shop, and they're easy to find.
  const liveProductsSorted = useMemo(
    () => products
      .filter((p) => !hiddenSlugs.has(p.slug) && !p.isPlaceholder)
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [products, hiddenSlugs],
  );

  // Pool of active batch codes, offered as suggestions when allocating a batch
  // to a line item. Sourced from the Batches admin page.
  const [batchPool, setBatchPool] = useState<string[]>([]);

  // Stock, so a product can be picked for an invoice knowing what is left. Per dosage, because an
  // invoice line is for one size; `stock` is the per-product total of those. Read from the
  // PUBLIC read-only endpoint on purpose: /api/admin/products/stock seeds missing rows as a side
  // effect of being read, and an invoice screen has no business writing stock rows.
  const [variantStock, setVariantStock] = useState<Record<string, Record<string, number>>>({});
  const [productStock, setProductStock] = useState<Record<string, number>>({});

  // Restricted invoice choices include permanent codes and sale variants,
  // never the Trial inventory's real names or cost fields.
  const [trialProducts, setTrialProducts] = useState<TrialPick[]>([]);

  useEffect(() => {
    fetch('/api/admin/invoices/trial-picker')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.products)) {
          setTrialProducts(
            (data.products as TrialPick[])
              .filter((p) => Array.isArray(p.variants) && p.variants.length > 0)
              .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }))
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/admin/products/catalogue')
      .then((res) => res.json())
      .then((data) => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});

    // Which products are hidden from the shop — so the catalogue picker can
    // exclude them (only live products should be selectable on an invoice).
    fetch('/api/products/visibility')
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data.hidden)) setHiddenSlugs(new Set<string>(data.hidden)); })
      .catch(() => {});

    fetch('/api/products/stock')
      .then((res) => res.json())
      .then((data) => {
        if (data.variantStock && typeof data.variantStock === 'object') setVariantStock(data.variantStock);
        if (data.stock && typeof data.stock === 'object') setProductStock(data.stock);
      })
      .catch(() => {});

    fetch('/api/admin/batches')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.batches)) {
          setBatchPool(
            (data.batches as { code: string; active: boolean }[])
              .filter((b) => b.active)
              .map((b) => b.code)
          );
        }
      })
      .catch(() => {});
  }, []);

  async function loadInvoice() {
    try {
      const res = await fetch(`/api/admin/invoices/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || 'Failed to load invoice.');
        return;
      }
      const inv: InvoiceRow = data.invoice;
      setInvoice(inv);
      setInvoiceNumber(inv.invoice_number);
      setCustomerName(inv.customer_name);
      setEmail(inv.email);
      setPhone(inv.phone ?? '');
      setCompanyName(inv.company_name ?? '');
      setBillingLine1(inv.billing_line1 ?? '');
      setBillingLine2(inv.billing_line2 ?? '');
      setBillingCity(inv.billing_city ?? '');
      setBillingPostcode(inv.billing_postcode ?? '');
      setBillingCountry(normalizeCountry(inv.billing_country));
      const hasShipping = Boolean(inv.shipping_line1 || inv.shipping_city || inv.shipping_postcode);
      setShipDifferent(hasShipping);
      setShippingLine1(inv.shipping_line1 ?? '');
      setShippingLine2(inv.shipping_line2 ?? '');
      setShippingCity(inv.shipping_city ?? '');
      setShippingPostcode(inv.shipping_postcode ?? '');
      setShippingCountry(normalizeCountry(inv.shipping_country));
      setShippingRecipient(inv.shipping_recipient ?? '');
      setSendToSomeoneElse(Boolean(inv.shipping_recipient));
      setInvoiceDate(formatDateInput(inv.invoice_date) || new Date().toISOString().slice(0, 10));
      setDueDate(formatDateInput(inv.due_date));
      setSubject(inv.subject ?? '');
      setMessage(inv.message ?? '');
      setFooterText(inv.footer_text ?? '');
      setInternalNotes(inv.internal_notes ?? '');
      setCustomerNotes(inv.customer_notes ?? '');
      setLineItems(inv.line_items.length ? inv.line_items : [emptyLineItem()]);
      setShippingLabel(inv.shipping_label ?? 'UK Delivery');
      setShippingAmount(String(Number(inv.shipping_amount)));
      setDiscountCode(inv.discount_code ?? '');
      setDiscountAmount(String(Number(inv.discount_amount)));
      setIntendedPaymentMethod(inv.intended_payment_method ?? 'fena');
      setFulfilmentType(inv.fulfilment_type ?? 'royal_mail');
      setAutomationFlags(inv.automation_flags ?? DEFAULT_AUTOMATION_FLAGS);
      setLoadError('');
      // Only now is the form showing the real invoice. Until this point an auto-save would be
      // saving an empty form over the top of whatever was actually stored.
      setHydrated(true);
    } catch {
      setLoadError('Failed to load invoice.');
    }
  }

  useEffect(() => {
    // A different invoice is a different baseline, so forget the last one's.
    setHydrated(false);
    lastSavedRef.current = null;
    setAutoSaveState('idle');
    setAutoSavedAt(null);
    loadInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload the invoice when the id in the URL changes. loadInvoice is redefined on every render, so listing it would refetch in a loop and discard unsaved edits.
  }, [id]);

  // Debounced customer lookup. Fires ~300ms after the admin stops typing so we
  // are not hitting the search endpoint on every keystroke.
  useEffect(() => {
    const term = customerSearch.trim();
    if (term.length < 2) { setCustomerResults([]); setCustomerSearching(false); return; }
    setCustomerSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/invoices/customer-search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setCustomerResults(Array.isArray(data.candidates) ? data.candidates : []);
        setCustomerSearchOpen(true);
      } catch {
        setCustomerResults([]);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [customerSearch]);

  // Drop a chosen customer's details onto the invoice. Name/email/phone/company
  // always take the chosen record; address fields only overwrite when the record
  // actually has them, so picking a member with no saved address never wipes an
  // address already typed on the invoice.
  // Picking a customer fills in their details. The BILLING address may only ever come from a real
  // billing address — their own saved record, or a past invoice (task 77b818aa). It used to take
  // whatever address the search returned, and for anyone whose most recent activity was an order
  // that was a DELIVERY address. A customer who once had a parcel sent to a friend then had the
  // friend's address appear as her billing address on her next invoice, which reads as the shop
  // quietly changing her details. It never changed them; only this prefill was wrong.
  //
  // Where all we hold is a past delivery address, it goes into the delivery section instead, with
  // the tick box turned on so it is plainly a delivery address and not a billing one.
  function applyCustomer(c: CustomerMatch) {
    setCustomerName(c.name || '');
    setEmail(c.email || '');
    setPhone(c.phone || '');
    setCompanyName(c.company || '');
    if (c.billingAddressIsReal) {
      if (c.line1) setBillingLine1(c.line1);
      if (c.line2) setBillingLine2(c.line2);
      if (c.city) setBillingCity(c.city);
      if (c.postcode) setBillingPostcode(c.postcode);
      if (c.country) setBillingCountry(normalizeCountry(c.country));
    } else if (c.line1 || c.postcode) {
      setShipDifferent(true);
      if (c.line1) setShippingLine1(c.line1);
      if (c.line2) setShippingLine2(c.line2);
      if (c.city) setShippingCity(c.city);
      if (c.postcode) setShippingPostcode(c.postcode);
      if (c.country) setShippingCountry(normalizeCountry(c.country));
    }
    setCustomerSearch('');
    setCustomerResults([]);
    setCustomerSearchOpen(false);
  }

  const locked = invoice?.status === 'paid' && !adjusting;
  const financialsDisabled = locked;

  const subtotal = useMemo(() => lineItems.reduce((sum, item) => sum + item.lineTotal, 0), [lineItems]);
  const total = useMemo(() => {
    const shipAmt = Number(shippingAmount) || 0;
    const discAmt = Number(discountAmount) || 0;
    return roundMoney(Math.max(0, roundMoney(subtotal) - discAmt) + shipAmt);
  }, [subtotal, shippingAmount, discountAmount]);

  function updateLineItem(index: number, patch: Partial<InvoiceLineItem>) {
    setLineItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch };
      next.lineTotal = computeLineTotal(next.quantity, next.unitPrice, next.discount);
      return next;
    }));
  }

  function setLineItemProduct(index: number, slug: string, dosage: string) {
    const product = products.find((p) => p.slug === slug);
    const variant = product?.variants.find((v) => v.dosage === dosage);
    if (!product || !variant) return;
    updateLineItem(index, {
      type: 'product',
      slug: product.slug,
      name: product.name,
      description: variant.dosage,
      unitPrice: variant.price,
      weightGrams: variant.shipping?.weightGrams ?? product.shipping?.weightGrams,
    });
  }

  // The saved line keeps type='trial' and trial:id. The server resolves the
  // permanent code from its own inventory rather than trusting this picker.
  function setLineItemTrial(index: number, trialId: number, dosage: string) {
    const product = trialProducts.find((p) => p.id === trialId);
    const variant = product?.variants.find((v) => v.dosage === dosage);
    if (!product || !variant) return;
    updateLineItem(index, {
      type: 'trial',
      slug: `trial:${product.id}`,
      name: product.code,
      description: variant.dosage,
      unitPrice: variant.price,
    });
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }

  async function applyDiscountCode() {
    if (!discountCode.trim()) return;
    setApplyCodeStatus('loading');
    setApplyCodeMessage('');
    try {
      const res = await fetch('/api/discount-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: discountCode.trim(),
          subtotal: roundMoney(subtotal),
          items: lineItems.map((item) => ({ slug: item.slug ?? null, price: item.unitPrice, quantity: item.quantity })),
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setDiscountAmount(String(roundMoney(data.discountAmount)));
        setDiscountCode(data.code);
        setApplyCodeStatus('idle');
        setApplyCodeMessage(data.message || 'Code applied.');
      } else {
        setApplyCodeStatus('error');
        setApplyCodeMessage(data.message || 'That code could not be applied.');
      }
    } catch {
      setApplyCodeStatus('error');
      setApplyCodeMessage('Could not check that code. Please try again.');
    }
  }

  function buildPayload() {
    return {
      invoiceNumber,
      customerName, email, phone: phone || null, companyName: companyName || null,
      billingLine1: billingLine1 || null, billingLine2: billingLine2 || null,
      billingCity: billingCity || null, billingPostcode: billingPostcode || null, billingCountry: billingCountry || null,
      shippingLine1: shipDifferent ? (shippingLine1 || null) : null,
      shippingLine2: shipDifferent ? (shippingLine2 || null) : null,
      shippingCity: shipDifferent ? (shippingCity || null) : null,
      shippingPostcode: shipDifferent ? (shippingPostcode || null) : null,
      shippingCountry: shipDifferent ? (shippingCountry || null) : null,
      // Only saved when both the different address and the different person are ticked, so
      // un-ticking either one clears it rather than leaving a stale name on the parcel.
      shippingRecipient: shipDifferent && sendToSomeoneElse ? (shippingRecipient.trim() || null) : null,
      invoiceDate, dueDate: dueDate || null,
      subject: subject || null, message: message || null, footerText: footerText || null,
      internalNotes: internalNotes || null, customerNotes: customerNotes || null,
      lineItems, shippingLabel: shippingLabel || null,
      shippingAmount: Number(shippingAmount) || 0,
      discountCode: discountCode || null,
      discountAmount: Number(discountAmount) || 0,
      intendedPaymentMethod, fulfilmentType, automationFlags,
      ...(adjusting ? { adjustment: true, adjustmentReason } : {}),
    };
  }

  /* ── A drafted invoice keeps itself (task de561135) ──────────────────────────────────────────
   *
   * Kieran: "Please ensure any invoice drafted for any new or existing client is auto-saved just in
   * case it is not completed straight away."
   *
   * Nothing here saved itself before. Pressing New Invoice does create a real row, so the invoice
   * existed, but everything typed afterwards lived only in this browser until Save was pressed. A
   * closed tab, a flat battery or a phone call took the lot, and the draft you came back to was
   * empty with no sign it had ever held anything.
   *
   * DRAFTS ONLY, and that is deliberate. A sent invoice is a document the customer is holding a
   * copy of; rewriting it quietly while somebody reads the screen is a different and worse thing
   * than the one being asked for. Save by hand still works there exactly as it always did, and a
   * paid invoice stays locked behind its adjustment reason.
   */
  const canAutoSave = hydrated && invoice?.status === 'draft' && !locked && !sending;
  const payloadJson = JSON.stringify(buildPayload());
  const unsaved = canAutoSave && lastSavedRef.current !== null && payloadJson !== lastSavedRef.current;

  useEffect(() => {
    if (!canAutoSave) return;
    // The first pass after loading is the baseline, not an edit. Without this the form would save
    // itself straight back over the invoice it had only just read.
    if (lastSavedRef.current === null) { lastSavedRef.current = payloadJson; return; }
    if (payloadJson === lastSavedRef.current) return;

    const handle = setTimeout(async () => {
      // A save already going: leave it. The next keystroke re-arms this timer, so nothing is lost.
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setAutoSaveState('saving');
      try {
        const res = await fetch(`/api/admin/invoices/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: payloadJson,
        });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          lastSavedRef.current = payloadJson;
          if (data?.invoice) setInvoice(data.invoice);
          setAutoSavedAt(new Date());
          setAutoSaveState('saved');
        } else {
          // Left marked unsaved on purpose, so the screen keeps saying so.
          setAutoSaveState('error');
        }
      } catch {
        setAutoSaveState('error');
      } finally {
        inFlightRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- payloadJson IS every field on the form; listing them individually would be the same dependency written out longhand.
  }, [payloadJson, canAutoSave, id]);

  /* The last net, and only when something genuinely has not reached the server. With the above
     working this almost never fires, which is the point: it means something is actually wrong. */
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  /* What the screen says about it. A thing that saves invisibly is only worth having if it tells
     you it has. */
  const autoSaveNotice: { text: string; bad: boolean } | null = !canAutoSave
    ? null
    : autoSaveState === 'error'
      ? { text: 'Could not save this draft on its own. Press Save to try again.', bad: true }
      : autoSaveState === 'saving'
        ? { text: 'Saving…', bad: false }
        : unsaved
          ? { text: 'Not saved yet', bad: false }
          : autoSavedAt
            ? { text: `Draft saved on its own at ${autoSavedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, bad: false }
            : { text: 'This draft saves itself as you type', bad: false };

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setSaveMessage('');
    setSaveError('');
    // Built once, so the exact thing sent is the thing recorded as saved.
    const payload = JSON.stringify(buildPayload());
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      const data = await res.json();
      if (res.ok) {
        setInvoice(data.invoice);
        lastSavedRef.current = payload;
        setAutoSavedAt(new Date());
        setAutoSaveState('saved');
        setSaveMessage('Saved.');
        setAdjusting(false);
        setAdjustmentReason('');
        return true;
      }
      setSaveError(data.error || 'Failed to save invoice.');
      return false;
    } catch {
      setSaveError('Failed to save invoice.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    setSending(true);
    setSendResult(null);
    try {
      // Send always saves first so the order it creates reflects the form's
      // current contents — but if that save fails (e.g. invalid line item
      // data), sending must NOT proceed with whatever stale/incomplete
      // version is still sitting in the database. Previously this was never
      // checked, so a failed save silently let Send continue anyway —
      // confirmed in production logs sending an invoice with a £0 total
      // straight to Fena, which understandably rejected it.
      const saved = await handleSave();
      if (!saved) {
        setSendResult({ ok: false, message: 'Could not send - fix the save error above first.' });
        return;
      }
      const res = await fetch(`/api/admin/invoices/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setInvoice(data.invoice);
        setSendResult({
          ok: true,
          message: data.fenaPaymentUrl
            ? `Invoice sent to ${email}${data.emailSent ? '' : ' (email delivery could not be confirmed)'}.`
            : `Invoice order ${data.orderNumber} created, but the Fena payment link could not be generated. Reason: ${data.fenaError || 'unknown - check Fena is configured'}. Email was still sent with the PayPal option only.`,
        });
      } else {
        setSendResult({ ok: false, message: data.error || 'Failed to send invoice.' });
      }
    } catch {
      setSendResult({ ok: false, message: 'Failed to send invoice.' });
    } finally {
      setSending(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/admin/invoices/${id}/duplicate`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.invoice?.id) {
        /* This used to navigate on success and do NOTHING AT ALL otherwise: no message, no
           explanation, the button simply went dead. That is the same fault Kieran reported on the
           order delete button and on send-to-another-customer (task 9b732fb3). */
        setSaveError(data?.error ?? 'Could not copy this invoice. Please try again.');
        return;
      }
      router.push(`/admin/invoices/${data.invoice.id}/edit`);
    } catch {
      setSaveError('Could not reach the server, so nothing was copied.');
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    let warning: ConfirmOptions = {
      title: 'Delete this invoice permanently?',
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    };
    if (invoice?.order_number) {
      warning = {
        ...warning,
        body: `This also deletes its linked order ${invoice.order_number} from Orders and Dispatch. This cannot be undone.`,
      };
      if (invoice.status === 'paid') {
        warning = {
          ...warning,
          title: 'This invoice is marked PAID. Delete it anyway?',
          body: `Order ${invoice.order_number} may already be dispatched. Deleting removes the invoice and that order from Orders and Dispatch. It does not refund or cancel any real shipment with Royal Mail.\n\nThis cannot be undone.`,
          confirmLabel: 'Yes, delete it anyway',
        };
      }
    }
    if (!(await confirm(warning))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' });
      if (res.ok) router.push('/admin/invoices');
    } finally {
      setDeleting(false);
    }
  }

  async function handleCancel() {
    if (!(await confirm({
      title: 'Cancel this invoice?',
      body: 'The customer will no longer be able to pay it.',
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel: true }),
      });
      const data = await res.json();
      if (res.ok) setInvoice(data.invoice);
    } finally {
      setCancelling(false);
    }
  }

  // Choosing Hand Delivered / No Delivery Required auto-unchecks "Trigger
  // Royal Mail" / "Send dispatch email" — still overridable afterwards via
  // the checkboxes themselves, this just sets a sane starting point.
  function handleFulfilmentTypeChange(value: FulfilmentType) {
    setFulfilmentType(value);
    if (value === 'hand_delivered' || value === 'no_delivery') {
      setAutomationFlags((prev) => ({ ...prev, triggerRoyalMail: false, sendDispatchEmail: false }));
    }
  }

  async function handleMarkPaid() {
    const requiresNote = intendedPaymentMethod === 'paypal';
    if (requiresNote && !paypalNote.trim()) {
      setPaypalResult({ ok: false, message: 'Enter a note (e.g. the PayPal transaction reference) before confirming.' });
      return;
    }
    setMarkingPaypalPaid(true);
    setPaypalResult(null);
    try {
      const res = await fetch(`/api/admin/invoices/${id}/mark-paypal-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: paypalNote.trim(), paymentMethod: intendedPaymentMethod }),
      });
      const data = await res.json();
      if (res.ok) {
        setInvoice(data.invoice);
        setPaypalResult({ ok: true, message: 'Marked as paid. Stock decremented, confirmation email sent (subject to the automation settings above).' });
      } else {
        setPaypalResult({ ok: false, message: data.error || 'Failed to mark as paid.' });
      }
    } finally {
      setMarkingPaypalPaid(false);
    }
  }

  if (loadError) {
    return (
      <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-clip">
          <p className="text-sm text-red-600 mb-4">{loadError}</p>
          <Link href="/admin/invoices" className="text-xs text-gold-700 hover:text-gold-700">Back to Invoices</Link>
        </main>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
        <AdminSidebar />
        <main className="flex-1 p-8 overflow-clip text-sm text-stone-500">Loading…</main>
      </div>
    );
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      <main className="flex-1 p-8 overflow-clip">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <Link href="/admin/invoices" className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors">
              &larr; Invoices
            </Link>
            <h1 className="text-lg font-semibold text-stone-800 mt-2 flex items-center gap-3">
              <span className="font-mono">{invoice.invoice_number}</span>
              <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${STATUS_TONE[invoice.status]}`}>
                {invoice.status.replace(/_/g, ' ')}
              </span>
            </h1>
            {invoice.order_number && (
              <p className="text-xs text-stone-500 mt-1">
                Linked order: <Link href={`/admin/orders?search=${encodeURIComponent(invoice.order_number)}`} className="text-gold-700 hover:text-gold-700 font-mono">{invoice.order_number}</Link>
                {invoice.payment_method_used && <span className="capitalize"> · paid via {invoice.payment_method_used}</span>}
                {invoice.payment_method_used === 'paypal' && Number(invoice.paypal_fee_amount) > 0 && (
                  <span> (includes a £{Number(invoice.paypal_fee_amount).toFixed(2)} PayPal processing fee, total charged £{(Number(invoice.total) + Number(invoice.paypal_fee_amount)).toFixed(2)})</span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <a
              href={`/api/admin/invoices/${id}/print`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
            >
              Print / PDF
            </a>
            <button onClick={handleDuplicate} disabled={duplicating} className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors disabled:opacity-50">
              {duplicating ? 'Duplicating…' : 'Duplicate'}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Delete Invoice'}
            </button>
            {['sent', 'viewed', 'payment_pending'].includes(invoice.status) && (
              <button onClick={handleCancel} disabled={cancelling} className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Cancel Invoice'}
              </button>
            )}
          </div>
        </div>

        <ResendNotice
          invoice={invoice}
          automationFlags={automationFlags}
          adjusting={adjusting}
          setAdjusting={setAdjusting}
          adjustmentReason={adjustmentReason}
          setAdjustmentReason={setAdjustmentReason}
        />

        <InvoiceCustomer
          customerName={customerName}
          setCustomerName={setCustomerName}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          companyName={companyName}
          setCompanyName={setCompanyName}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
          customerResults={customerResults}
          customerSearching={customerSearching}
          customerSearchOpen={customerSearchOpen}
          setCustomerSearchOpen={setCustomerSearchOpen}
          applyCustomer={applyCustomer}
        />

        <InvoiceAddresses
          billingLine1={billingLine1}
          setBillingLine1={setBillingLine1}
          billingLine2={billingLine2}
          setBillingLine2={setBillingLine2}
          shippingLine1={shippingLine1}
          setShippingLine1={setShippingLine1}
          shippingLine2={shippingLine2}
          setShippingLine2={setShippingLine2}
          billingCity={billingCity}
          setBillingCity={setBillingCity}
          billingPostcode={billingPostcode}
          setBillingPostcode={setBillingPostcode}
          billingCountry={billingCountry}
          setBillingCountry={setBillingCountry}
          shipDifferent={shipDifferent}
          sendToSomeoneElse={sendToSomeoneElse}
          setSendToSomeoneElse={setSendToSomeoneElse}
          shippingRecipient={shippingRecipient}
          setShippingRecipient={setShippingRecipient}
          customerName={customerName}
          setShipDifferent={setShipDifferent}
          shippingCity={shippingCity}
          setShippingCity={setShippingCity}
          shippingPostcode={shippingPostcode}
          setShippingPostcode={setShippingPostcode}
          shippingCountry={shippingCountry}
          setShippingCountry={setShippingCountry}
        />

        <InvoiceDatesAndText
          invoiceNumber={invoiceNumber}
          setInvoiceNumber={setInvoiceNumber}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          dueDate={dueDate}
          setDueDate={setDueDate}
          subject={subject}
          setSubject={setSubject}
          message={message}
          setMessage={setMessage}
          footerText={footerText}
          setFooterText={setFooterText}
          internalNotes={internalNotes}
          setInternalNotes={setInternalNotes}
          customerNotes={customerNotes}
          setCustomerNotes={setCustomerNotes}
        />

        <InvoiceLineItems
          lineItems={lineItems}
          updateLineItem={updateLineItem}
          setLineItemProduct={setLineItemProduct}
          setLineItemTrial={setLineItemTrial}
          addLineItem={addLineItem}
          removeLineItem={removeLineItem}
          products={products}
          liveProductsSorted={liveProductsSorted}
          trialProducts={trialProducts}
          batchPool={batchPool}
          financialsDisabled={financialsDisabled}
          variantStock={variantStock}
          productStock={productStock}
        />

        <InvoiceTotals
          shippingLabel={shippingLabel}
          setShippingLabel={setShippingLabel}
          shippingAmount={shippingAmount}
          setShippingAmount={setShippingAmount}
          discountCode={discountCode}
          setDiscountCode={setDiscountCode}
          discountAmount={discountAmount}
          setDiscountAmount={setDiscountAmount}
          applyDiscountCode={applyDiscountCode}
          applyCodeStatus={applyCodeStatus}
          applyCodeMessage={applyCodeMessage}
          subtotal={subtotal}
          total={total}
          financialsDisabled={financialsDisabled}
        />

        <FulfilmentAndPayment
          fulfilmentType={fulfilmentType}
          handleFulfilmentTypeChange={handleFulfilmentTypeChange}
          intendedPaymentMethod={intendedPaymentMethod}
          setIntendedPaymentMethod={setIntendedPaymentMethod}
          automationFlags={automationFlags}
          setAutomationFlags={setAutomationFlags}
        />

        <MarkPaidPanel
          invoice={invoice}
          intendedPaymentMethod={intendedPaymentMethod}
          paypalNote={paypalNote}
          setPaypalNote={setPaypalNote}
          handleMarkPaid={handleMarkPaid}
          markingPaypalPaid={markingPaypalPaid}
          paypalResult={paypalResult}
        />

        <InvoiceActions
          invoice={invoice}
          automationFlags={automationFlags}
          handleSave={handleSave}
          saving={saving}
          handleSend={handleSend}
          sending={sending}
          saveMessage={saveMessage}
          saveError={saveError}
          autoSaveNotice={autoSaveNotice}
          sendResult={sendResult}
        />
      </div>
      </main>
    </div>
  );
}
