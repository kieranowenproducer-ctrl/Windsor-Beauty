'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { referralChannel } from '@/lib/referralSources';

import ResendVerificationPanel from './ResendVerificationPanel';
import MembershipSignupStats from './MembershipSignupStats';
import CustomerFilters from './CustomerFilters';
import CustomersTable from './CustomersTable';
import CustomerDetailPanel from './CustomerDetailPanel';
import DuplicateAccountsPanel from './DuplicateAccountsPanel';
import type { DuplicateFinding } from '@/lib/db/duplicateAccounts';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import {
  emptyDraft,
  draftFromCustomer,
  formatDate,
  customerDisplayName,
  type Customer,
  type CustomerDraft,
  type SortField,
  type SortDir,
  type CustomerOrder,
  type UnverifiedCustomer,
} from './customerTypes';
export default function AdminCustomersPage() {
  const confirm = useConfirm();
  const [customers, setCustomers] = useState<Customer[]>([]);

  // The second-account check (task c76f31fb). Runs automatically at sign-up; this is the on-demand
  // version behind the Check For Second Accounts button.
  const [duplicateFindings, setDuplicateFindings] = useState<DuplicateFinding[]>([]);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicateCheckFailed, setDuplicateCheckFailed] = useState(false);
  const [allowingId, setAllowingId] = useState<number | null>(null);
  const [allowError, setAllowError] = useState('');

  /**
   * Mark one flagged account as genuine (task ce609555).
   *
   * It posts to the welcome-offer check Kieran built on 16 September rather than recording the
   * decision somewhere new, so this list, the dashboard and the individual customer panel all read
   * one record of who has been cleared. Approving there also releases the 10% that was being held,
   * which is why the panel says so next to the button.
   *
   * The list is re-run afterwards rather than the row being hidden locally: that way what is on
   * screen is what the server actually thinks, and a failed save cannot leave a row looking dealt
   * with when it is not.
   */
  async function allowDuplicateAsAuthentic(customerId: number) {
    setAllowingId(customerId);
    setAllowError('');
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/opening-offer-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.error) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'It could not be saved.');
      }
      await runDuplicateCheck();
      loadCustomers();
    } catch (err) {
      setAllowError(err instanceof Error ? err.message : 'It could not be saved. Please try again.');
    } finally {
      setAllowingId(null);
    }
  }

  /**
   * A REFUSED CHECK IS NOT AN EMPTY ONE. If this fails the panel says so rather than reporting
   * that nothing was found, because "nothing found" is both what somebody hopes to read and
   * exactly what a broken query looks like.
   */
  function runDuplicateCheck() {
    setDuplicateChecking(true);
    setDuplicateCheckFailed(false);
    return fetch('/api/admin/duplicate-accounts')
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !Array.isArray(data.findings) || data.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'no answer');
        }
        setDuplicateFindings(data.findings);
        setDuplicateChecked(true);
      })
      .catch(() => {
        setDuplicateCheckFailed(true);
        setDuplicateChecked(false);
      })
      .finally(() => setDuplicateChecking(false));
  }
  const [loading, setLoading] = useState(true);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [search, setSearch] = useState('');
  const [marketingOnly, setMarketingOnly] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [sortField, setSortField] = useState<SortField>('joined');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  // One draft for the whole record. Kieran's note (task aecf9654): only the name
  // was editable, so a mistyped referral source or a changed address could only
  // be fixed by deleting the account.
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [codeStatusSaving, setCodeStatusSaving] = useState(false);
  const [codeStatusError, setCodeStatusError] = useState('');
  const [offerCheckSaving, setOfferCheckSaving] = useState(false);
  const [offerCheckError, setOfferCheckError] = useState('');

  // Resending someone their verification link from here, so a customer who says "I never got it"
  // is fixed on the call rather than by opening another screen (Kieran, 2 August).
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendVerificationResult, setResendVerificationResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Deep link from the dashboard: /admin/customers?customer=12&edit=1 selects that
  // member and drops straight into the edit form, so a new signup can be corrected
  // without hunting for them in the table.
  const [pendingDeepLink, setPendingDeepLink] = useState<{ id: number; edit: boolean } | null>(null);

  // The resend-verification box at the top of the page (task d2796f97) — the
  // successor to the pre-launch Early Subscribers list. One row per customer
  // who has never clicked their verification link, each with its own Resend.
  const [unverified, setUnverified] = useState<UnverifiedCustomer[]>([]);
  const [panelResendingId, setPanelResendingId] = useState<number | null>(null);
  const [panelResendResults, setPanelResendResults] = useState<Record<number, { ok: boolean; message: string }>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/customers/unverified')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && Array.isArray(data.unverified)) setUnverified(data.unverified);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function panelResendVerification(u: UnverifiedCustomer) {
    setPanelResendingId(u.id);
    setPanelResendResults(r => { const next = { ...r }; delete next[u.id]; return next; });
    try {
      const res = await fetch(`/api/admin/customers/${u.id}/resend-verification`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setPanelResendResults(r => ({ ...r, [u.id]: { ok: true, message: `Sent to ${u.email}. Ask them to check junk if it does not appear.` } }));
        setUnverified(list => list.map(item => (item.id === u.id
          ? { ...item, last_sent_at: new Date().toISOString(), times_sent: item.times_sent + 1, last_failure_at: null, last_failure_message: null }
          : item)));
      } else {
        setPanelResendResults(r => ({ ...r, [u.id]: { ok: false, message: data?.error ?? 'Could not send it. Please try again shortly.' } }));
      }
    } catch {
      setPanelResendResults(r => ({ ...r, [u.id]: { ok: false, message: 'Could not reach the server. Please try again.' } }));
    } finally {
      setPanelResendingId(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('customer');
    const id = raw ? Number(raw) : NaN;
    if (Number.isInteger(id)) {
      setPendingDeepLink({ id, edit: params.get('edit') === '1' });
    }
  }, []);

  /**
   * Pull the customer list. Lifted out of the effect below so that allowing an account as authentic
   * can refresh it too (task ce609555): the row carries that account's welcome-offer status, and
   * without a refresh the panel on the right would still say the offer was paused seconds after it
   * had been released.
   */
  async function loadCustomers() {
    try {
      const res = await fetch('/api/admin/customers');
      const data = await res.json();
      setDbConfigured(data.dbConfigured !== false);
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin/customers');
        const data = await res.json();
        if (cancelled) return;
        setDbConfigured(data.dbConfigured !== false);
        setCustomers(Array.isArray(data.customers) ? data.customers : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'joined' ? 'desc' : 'desc');
    }
  }

  useEffect(() => {
    if (!pendingDeepLink || customers.length === 0) return;
    const match = customers.find(c => c.id === pendingDeepLink.id);
    setPendingDeepLink(null);
    if (!match) return;
    void selectCustomer(match).then(() => {
      if (pendingDeepLink.edit) {
        setDraft(draftFromCustomer(match));
        setNameError('');
        setEditingName(true);
      }
    });
     
  }, [pendingDeepLink, customers]);

  async function selectCustomer(c: Customer) {
    setSelected(c);
    setCustomerOrders([]);
    setLoadingOrders(true);
    setEditingName(false);
    setNameError('');
    setDeleteError('');
    setOfferCheckError('');
    // Never let one customer's "sent" message sit above the next customer's name.
    setResendVerificationResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${c.id}/orders?email=${encodeURIComponent(c.email)}`);
      const data = await res.json();
      setCustomerOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch {
      setCustomerOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }

  // On a phone the detail panel is not beside the table, it is underneath the
  // whole of it (task 99476dc9). Tapping somebody looked like it did nothing,
  // and the edit pencil was never found. Bring the panel to them.
  //
  // In an effect keyed on who is selected, not inside selectCustomer: run any
  // earlier and the panel being scrolled to is still the "select a customer"
  // placeholder, and the scroll lands past the name and the pencil.
  //
  // Moves whichever box is ACTUALLY scrolling, which was worth measuring
  // rather than assuming: <main> carries overflow-y-auto and looks like the
  // scroller, but on a phone it grows to its full height and never scrolls —
  // the window does. Asking scrollIntoView to sort it out moves both at once
  // and overshoots the name and the pencil, which are the two things that had
  // to end up on screen.
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    if (!window.matchMedia('(max-width: 1279px)').matches) return;
    const panel = document.getElementById('customer-detail');
    if (!panel) return;

    // How much of the top of the screen is covered by bars that do not scroll
    // away: the site header and the ticker are fixed, so scrolling the panel to
    // the top of the window puts its name and its edit pencil BEHIND them. That
    // is the whole of the earlier overshoot, and it was the header, not the
    // maths. Measured rather than guessed at, so it stays right if the header
    // changes height.
    const stack = document.elementsFromPoint(Math.floor(window.innerWidth / 2), 1);
    let covered = 0;
    for (const el of stack) {
      const pos = getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') covered = Math.max(covered, el.getBoundingClientRect().bottom);
    }
    const OFFSET = covered + 12;

    const scroller = panel.closest('main');
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
      const top = panel.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top: Math.max(0, top - OFFSET), behavior: 'smooth' });
    } else {
      const top = panel.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - OFFSET), behavior: 'smooth' });
    }
  }, [selectedId]);

  function startEditName() {
    if (!selected) return;
    setDraft(draftFromCustomer(selected));
    setNameError('');
    setEditingName(true);
  }

  function setField<K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function cancelEditName() {
    setEditingName(false);
    setNameError('');
  }

  async function saveName() {
    if (!selected) return;
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const email = draft.email.trim();
    if (!firstName || !lastName) {
      setNameError('Please enter both a first and last name.');
      return;
    }
    if (!email) {
      setNameError('Please enter an email address.');
      return;
    }
    // Email is what this member signs in with, so a change is worth a beat of
    // thought rather than a silent save.
    if (email.toLowerCase() !== selected.email.toLowerCase()) {
      const ok = await confirm({
        title: "Change this member's sign-in email?",
        body: `From ${selected.email} to ${email}.\n\nThis is the address they sign in with and where their order emails go.`,
        confirmLabel: 'Yes, change it',
        cancelLabel: 'Leave it as it is',
      });
      if (!ok) return;
    }
    setSavingName(true);
    setNameError('');
    try {
      const res = await fetch(`/api/admin/customers/${selected.id}`, {
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
        setNameError(data?.error || 'Could not update this customer. Please try again.');
        return;
      }
      // Take the saved row back from the server so what is on screen is what is
      // in the database, including any trimming it applied.
      const saved = data?.customer ?? {};
      const patch: Partial<Customer> = {
        firstName: saved.firstName ?? firstName,
        lastName: saved.lastName ?? lastName,
        email: saved.email ?? email,
        phone: saved.phone ?? null,
        referredBy: saved.referredBy ?? null,
        addressLine1: saved.addressLine1 ?? null,
        addressLine2: saved.addressLine2 ?? null,
        addressCity: saved.addressCity ?? null,
        addressPostcode: saved.addressPostcode ?? null,
        addressCountry: saved.addressCountry ?? null,
        marketingConsent: typeof saved.marketingConsent === 'boolean' ? saved.marketingConsent : draft.marketingConsent,
      };
      setCustomers(prev => prev.map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
      setSelected(prev => (prev ? { ...prev, ...patch } : prev));
      setEditingName(false);
    } catch {
      setNameError('Something went wrong. Please try again.');
    } finally {
      setSavingName(false);
    }
  }

  // Burn or restore this member's signup code by hand. Codes are burned
  // automatically at checkout; this covers the cases that never touch
  // checkout, e.g. someone who was given their 10% another way and should not
  // also be able to spend the code.
  async function resendVerificationEmail() {
    if (!selected) return;
    setResendingVerification(true);
    setResendVerificationResult(null);
    try {
      const res = await fetch(`/api/admin/customers/${selected.id}/resend-verification`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setResendVerificationResult({
          ok: true,
          message: `Sent to ${data?.sentTo ?? selected.email}${data?.discountCode ? `, with their code ${data.discountCode} inside it` : ''}. Ask them to check junk if it does not appear.`,
        });
        // Their code is created by the resend, so the panel would otherwise still say "Not issued".
        if (data?.discountCode) {
          setCustomers(list => list.map(c => (c.id === selected.id ? { ...c, discountCode: data.discountCode, discountCodeStatus: 'active' } : c)));
        }
      } else {
        setResendVerificationResult({
          ok: false,
          message: `${data?.error ?? 'Could not send it. Please try again shortly.'}${data?.discountCode ? ` Their code is ${data.discountCode}, so you can give it to them directly.` : ''}`,
        });
      }
    } catch {
      setResendVerificationResult({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setResendingVerification(false);
    }
  }

  async function setSelectedCodeStatus(status: 'used' | 'active') {
    if (!selected?.discountCode) return;
    const confirmed = await confirm(
      status === 'used'
        ? {
            title: `Mark ${selected.discountCode} as redeemed?`,
            body: `${customerDisplayName(selected)} will not be able to use it at checkout.`,
            confirmLabel: 'Yes, mark it used',
            cancelLabel: 'Leave it',
          }
        : {
            title: `Make ${selected.discountCode} available again?`,
            body: `${customerDisplayName(selected)} will be able to use it at checkout.`,
            confirmLabel: 'Yes, make it available',
            cancelLabel: 'Leave it',
          }
    );
    if (!confirmed) return;

    setCodeStatusSaving(true);
    setCodeStatusError('');
    try {
      const res = await fetch(`/api/admin/customers/${selected.id}/discount-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setCodeStatusError(data?.error || 'Could not update the code. Please try again.');
        return;
      }
      const patch = { discountCodeStatus: status } as Partial<Customer>;
      setCustomers(prev => prev.map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
      setSelected(prev => (prev ? { ...prev, ...patch } : prev));
    } catch {
      setCodeStatusError('Something went wrong. Please try again.');
    } finally {
      setCodeStatusSaving(false);
    }
  }

  async function updateOpeningOffer(action: 'check' | 'approve' | 'hold') {
    if (!selected) return;
    setOfferCheckSaving(true);
    setOfferCheckError('');
    try {
      const res = await fetch(`/api/admin/customers/${selected.id}/opening-offer-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.review) {
        setOfferCheckError(data?.error || 'The check did not finish. Please try again.');
        return;
      }
      const patch = { openingOfferReview: data.review } as Partial<Customer>;
      setCustomers(prev => prev.map(c => (c.id === selected.id ? { ...c, ...patch } : c)));
      setSelected(prev => (prev ? { ...prev, ...patch } : prev));
    } catch {
      setOfferCheckError('Could not reach the server. Please try again.');
    } finally {
      setOfferCheckSaving(false);
    }
  }

  async function deleteSelectedCustomer() {
    if (!selected) return;
    const confirmed = await confirm({
      title: `Permanently delete the account for ${customerDisplayName(selected)}?`,
      body: `${selected.email}\n\nTheir login, sessions and membership details are removed. Past orders are kept, they just stop being linked to an account.\n\nThis cannot be undone.`,
      confirmLabel: 'Yes, delete the account',
      cancelLabel: 'Keep the account',
      tone: 'danger',
    });
    if (!confirmed) return;

    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/admin/customers/${selected.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error || 'Could not delete this customer. Please try again.');
        return;
      }
      setCustomers(prev => prev.filter(c => c.id !== selected.id));
      setSelected(null);
    } catch {
      setDeleteError('Something went wrong. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = customers
    .filter(c => {
      const name = customerDisplayName(c).toLowerCase();
      const matchesSearch =
        name.includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.referredBy ?? '').toLowerCase().includes(search.toLowerCase());
      const matchesMarketing = !marketingOnly || c.marketingConsent;
      return matchesSearch && matchesMarketing;
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':       cmp = customerDisplayName(a).localeCompare(customerDisplayName(b)); break;
        case 'totalSpent': cmp = a.totalSpent - b.totalSpent; break;
        case 'orderCount': cmp = a.orderCount - b.orderCount; break;
        case 'lastOrder':  cmp = (a.lastOrderAt ?? '').localeCompare(b.lastOrderAt ?? ''); break;
        case 'joined':     cmp = a.createdAt.localeCompare(b.createdAt); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const marketingCount = customers.filter(c => c.marketingConsent).length;

  // Membership signup stats — codes are issued once at registration, then
  // flip from 'active' to 'used' in discount_signups the moment they're
  // redeemed on a placed order (see redeemDiscountCode in src/lib/db.ts).
  const signupsIssued = customers.filter(c => c.discountCode).length;
  const signupsRedeemed = customers.filter(c => c.discountCodeStatus === 'used').length;
  const signupsUnredeemed = signupsIssued - signupsRedeemed;
  const redemptionRate = signupsIssued > 0 ? Math.round((signupsRedeemed / signupsIssued) * 100) : 0;

  /* COUNTED BY CHANNEL, NOT BY THE EXACT WORDS (task 38962e15).
   *
   * This grouped on whatever the member typed, so "Instagram", "instagram", "IG" and "insta" were
   * four sources of one customer each and the campaign could not be read off it. Sign-up now
   * offers a list, and `referralChannel` takes the channel off the front of the saved answer, so
   * every gym counts under "A gym, clinic or partner" while the gym's own name stays on the
   * customer. Anything recorded before the list existed is left exactly as it was typed rather
   * than swept into "Other": it is the only history this report has. */
  const referralCounts = new Map<string, { label: string; count: number }>();
  for (const c of customers) {
    const channel = referralChannel(c.referredBy);
    if (!channel) continue;
    const key = channel.toLowerCase();
    const seen = referralCounts.get(key);
    if (seen) seen.count += 1;
    else referralCounts.set(key, { label: channel, count: 1 });
  }
  const topReferralSources = Array.from(referralCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  function exportMarketingList() {
    const subscribed = customers.filter(c => c.marketingConsent);
    const rows = [
      ['First Name', 'Last Name', 'Email', 'Phone'],
      ...subscribed.map(c => [c.firstName || '', c.lastName || '', c.email, c.phone || '']),
    ];
    const csv = rows.map(r => r.map(field => `"${field.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'windsor-beauty-marketing-list.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportAttributionList() {
    const rows = [
      ['First Name', 'Last Name', 'Email', 'Phone', 'How They Heard About Us', 'Discount Code', 'Address Line 1', 'Address Line 2', 'City', 'Postcode', 'Country', 'Registered'],
      ...customers.map(c => [
        c.firstName || '', c.lastName || '', c.email, c.phone || '', c.referredBy || '',
        c.discountCode || '', c.addressLine1 || '', c.addressLine2 || '', c.addressCity || '',
        c.addressPostcode || '', c.addressCountry || '', formatDate(c.createdAt),
      ]),
    ];
    const csv = rows.map(r => r.map(field => `"${field.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'windsor-beauty-referral-attribution.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-4 sm:p-8 overflow-clip">
        <div className="max-w-6xl">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Customers</h1>
              <p className="text-xs text-stone-400">
                {dbConfigured
                  ? `${customers.length} account${customers.length === 1 ? '' : 's'} registered, ${marketingCount} subscribed to marketing emails.`
                  : 'Database not connected — customer accounts cannot be created yet.'}
              </p>
            </div>
            {/* Wraps on a phone (task 1fb77058). Two wide buttons side by side
                with shrink-0 put Export Marketing List 56px past the edge. */}
            <div className="flex flex-wrap gap-2">
              {/* Find Customers (task c22cb6cb): filtering, ticking and marketing live on their own
                  screen, because this page answers "who is this person" and that one answers
                  "who shall I write to". */}
              <Link
                href="/admin/customers/find"
                className="text-[10px] tracking-[0.2em] uppercase bg-gold-700 text-white px-4 py-2.5 hover:bg-gold-800 transition-colors"
              >
                Find Customers
              </Link>
              <button
                onClick={exportAttributionList}
                disabled={customers.length === 0}
                className="text-[10px] tracking-[0.2em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export Referral Attribution
              </button>
              <button
                onClick={exportMarketingList}
                disabled={marketingCount === 0}
                className="text-[10px] tracking-[0.2em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export Marketing List
              </button>
              {/* Second-account check (task c76f31fb). It runs by itself whenever somebody signs
                  up; this is for when you want to ask now. It only looks: nothing is written,
                  nobody is emailed and no account is touched. */}
              <button
                onClick={runDuplicateCheck}
                disabled={duplicateChecking}
                className="text-[10px] tracking-[0.2em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {duplicateChecking ? 'Checking...' : 'Check For Second Accounts'}
              </button>
            </div>
          </div>

          <DuplicateAccountsPanel
            checking={duplicateChecking}
            checked={duplicateChecked}
            failed={duplicateCheckFailed}
            findings={duplicateFindings}
            onAllow={allowDuplicateAsAuthentic}
            allowingId={allowingId}
            allowError={allowError}
          />

          <ResendVerificationPanel
            unverified={unverified}
            panelResendVerification={panelResendVerification}
            panelResendingId={panelResendingId}
            panelResendResults={panelResendResults}
          />

          <MembershipSignupStats
            signupsIssued={signupsIssued}
            signupsRedeemed={signupsRedeemed}
            signupsUnredeemed={signupsUnredeemed}
            redemptionRate={redemptionRate}
            topReferralSources={topReferralSources}
            setSearch={setSearch}
          />

          <CustomerFilters
            search={search}
            setSearch={setSearch}
            marketingOnly={marketingOnly}
            setMarketingOnly={setMarketingOnly}
          />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <CustomersTable
              loading={loading}
              customers={customers}
              filtered={filtered}
              selected={selected}
              selectCustomer={selectCustomer}
              sortField={sortField}
              sortDir={sortDir}
              handleSort={handleSort}
            />

            {/* scroll-mt clears the sticky admin bar above it, so the name and
                the edit pencil are the first things on screen, not the first
                things just off it. */}
            <div id="customer-detail" className="scroll-mt-20">
            <CustomerDetailPanel
              selected={selected}
              customerOrders={customerOrders}
              loadingOrders={loadingOrders}
              editingName={editingName}
              startEditName={startEditName}
              cancelEditName={cancelEditName}
              draft={draft}
              setField={setField}
              saveName={saveName}
              savingName={savingName}
              nameError={nameError}
              resendVerificationEmail={resendVerificationEmail}
              resendingVerification={resendingVerification}
              resendVerificationResult={resendVerificationResult}
              setSelectedCodeStatus={setSelectedCodeStatus}
              codeStatusSaving={codeStatusSaving}
              codeStatusError={codeStatusError}
              updateOpeningOffer={updateOpeningOffer}
              offerCheckSaving={offerCheckSaving}
              offerCheckError={offerCheckError}
              deleteSelectedCustomer={deleteSelectedCustomer}
              deleting={deleting}
              deleteError={deleteError}
            />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
