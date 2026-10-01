'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useConfirm } from '@/components/admin/ConfirmProvider';

type Kind = 'alias' | 'abbreviation' | 'misspelling' | 'category' | 'ambiguous' | 'blend';
type Status = 'review' | 'approved' | 'rejected';
type Confidence = 'high' | 'medium' | 'low';
type ViewFilter = 'all' | 'built-in' | 'admin' | 'review' | 'active' | 'disabled' | 'recent';

interface SourceLink {
  label?: string;
  role?: string;
  url: string;
}

interface AdminRecord {
  id: number;
  kind: Kind;
  term: string;
  /* Set when this row is an EDIT of a built-in record: the built-in it
     stands in for. Null for an ordinary administrator-added term. */
  supersedes_builtin?: string | null;
  canonical_slug: string | null;
  display_name: string | null;
  aliases: string[];
  misspellings: string[];
  related_slugs: string[];
  categories: string[];
  component_slugs: string[];
  ambiguous_with: string[];
  source_urls: unknown;
  confidence: Confidence;
  review_status: Status;
  auto_resolve: boolean;
  enabled: boolean;
  notes: string | null;
  last_verified: string | null;
  created_at: string;
  updated_at: string;
}

interface BuiltInRecord {
  id: string;
  sourceType: 'built-in';
  recordType: 'compound' | 'ambiguous' | 'blend';
  canonicalSlug?: string;
  canonicalName?: string;
  displayName?: string;
  aliases?: string[];
  abbreviations?: string[];
  misspellings?: string[];
  phoneticForms?: string[];
  relatedSlugs?: string[];
  ambiguousWith?: string[];
  components?: string[];
  categories?: string[];
  sources?: SourceLink[];
  confidence?: Confidence;
  reviewStatus?: Status;
  autoResolve?: boolean;
  enabled?: boolean;
  notes?: string;
  lastVerified?: string;
}

interface FormState {
  kind: Kind;
  term: string;
  canonicalSlug: string;
  displayName: string;
  aliases: string;
  misspellings: string;
  relatedSlugs: string;
  categories: string;
  componentSlugs: string;
  ambiguousWith: string;
  sourceUrls: string;
  confidence: Confidence;
  reviewStatus: Status;
  autoResolve: boolean;
  enabled: boolean;
  notes: string;
  lastVerified: string;
  /* Set when this form is EDITING a built-in record: the id of the built-in
     it stands in for. Empty for an ordinary administrator-added term. */
  supersedesBuiltIn: string;
}

type SelectedRecord =
  | { sourceType: 'built-in'; record: BuiltInRecord }
  | { sourceType: 'admin'; record: AdminRecord };

function emptyForm(): FormState {
  return {
    kind: 'alias',
    term: '',
    canonicalSlug: '',
    displayName: '',
    aliases: '',
    misspellings: '',
    relatedSlugs: '',
    categories: '',
    componentSlugs: '',
    ambiguousWith: '',
    sourceUrls: '',
    confidence: 'medium',
    reviewStatus: 'review',
    autoResolve: false,
    enabled: true,
    notes: '',
    lastVerified: '',
    supersedesBuiltIn: '',
  };
}

function list(value: string): string[] {
  return Array.from(new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function adminSources(value: unknown): SourceLink[] {
  return stringList(value).map((url) => ({ url, label: url }));
}

function payload(form: FormState) {
  return {
    ...form,
    canonicalSlug: form.canonicalSlug || null,
    displayName: form.displayName || null,
    aliases: list(form.aliases),
    misspellings: list(form.misspellings),
    relatedSlugs: list(form.relatedSlugs),
    categories: list(form.categories),
    componentSlugs: list(form.componentSlugs),
    ambiguousWith: list(form.ambiguousWith),
    sourceUrls: list(form.sourceUrls),
    notes: form.notes || null,
    lastVerified: form.lastVerified || null,
    supersedesBuiltIn: form.supersedesBuiltIn || null,
  };
}

function formForRecord(row: AdminRecord): FormState {
  return {
    kind: row.kind,
    term: row.term,
    canonicalSlug: row.canonical_slug || '',
    displayName: row.display_name || '',
    aliases: (row.aliases || []).join(', '),
    misspellings: (row.misspellings || []).join(', '),
    relatedSlugs: (row.related_slugs || []).join(', '),
    categories: (row.categories || []).join(', '),
    componentSlugs: (row.component_slugs || []).join(', '),
    ambiguousWith: (row.ambiguous_with || []).join(', '),
    sourceUrls: adminSources(row.source_urls).map((source) => source.url).join('\n'),
    confidence: row.confidence,
    reviewStatus: row.review_status,
    autoResolve: row.auto_resolve,
    enabled: row.enabled,
    notes: row.notes || '',
    lastVerified: row.last_verified ? row.last_verified.slice(0, 10) : '',
    supersedesBuiltIn: row.supersedes_builtin || '',
  };
}

/* Kieran, 19 Aug 2026: built-in records must be editable too. They live in
   source control and cannot be written to at run time, so an edit is saved as
   an override row that stands in for the built-in. This pre-fills the ordinary
   edit form with everything the built-in currently says, so editing one feels
   exactly like editing any other record. Deleting the override puts the
   original back untouched. */
function formForBuiltIn(record: BuiltInRecord): FormState {
  const kind: Kind = record.recordType === 'blend' ? 'blend' : record.recordType === 'ambiguous' ? 'ambiguous' : 'alias';
  return {
    kind,
    term: builtInName(record),
    canonicalSlug: record.canonicalSlug || '',
    displayName: record.displayName || record.canonicalName || '',
    aliases: [...(record.aliases || []), ...(record.abbreviations || [])].join(', '),
    misspellings: (record.misspellings || []).join(', '),
    relatedSlugs: (record.relatedSlugs || []).join(', '),
    categories: (record.categories || []).join(', '),
    componentSlugs: (record.components || []).join(', '),
    ambiguousWith: (record.ambiguousWith || []).join(', '),
    sourceUrls: (record.sources || []).map((source) => source.url).join('\n'),
    confidence: record.confidence || 'high',
    // An edit of a built-in starts approved: the built-in it replaces was
    // already live, so leaving it unapproved would silently switch the term off.
    reviewStatus: 'approved',
    autoResolve: record.autoResolve !== false,
    enabled: true,
    notes: record.notes || '',
    lastVerified: new Date().toISOString().slice(0, 10),
    supersedesBuiltIn: record.id,
  };
}

function displayDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function builtInName(record: BuiltInRecord): string {
  return record.displayName || record.canonicalName || record.id;
}

function builtInDestination(record: BuiltInRecord): string {
  if (record.recordType === 'blend') return (record.components || []).join(', ') || 'Blend record';
  return record.displayName || record.canonicalName || record.canonicalSlug || 'Clarification required';
}

function statusStyle(status: string) {
  if (status === 'approved' || status === 'active') return 'bg-emerald-50 text-emerald-700';
  if (status === 'rejected' || status === 'disabled') return 'bg-red-50 text-red-700';
  return 'bg-amber-50 text-amber-800';
}

const inputClass = 'mt-1 w-full border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-800 shadow-sm outline-none transition-colors placeholder:text-stone-300 focus-visible:border-gold-500 focus-visible:ring-2 focus-visible:ring-gold-200 disabled:bg-stone-100 disabled:text-stone-400';
const smallButton = 'min-h-10 border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-600 transition-colors hover:border-gold-400 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300';

export default function PearlTerminologyPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [builtIns, setBuiltIns] = useState<BuiltInRecord[]>([]);
  const [compounds, setCompounds] = useState<Array<{ slug: string; name: string }>>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [selected, setSelected] = useState<SelectedRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<ViewFilter>('all');
  const [search, setSearch] = useState('');

  async function load(preferred?: { sourceType: 'built-in' | 'admin'; id: string | number }) {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/pearl-terminology');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load terminology.');
      const nextRows = Array.isArray(data.records) ? data.records : [];
      const nextBuiltIns = Array.isArray(data.builtInRecords) ? data.builtInRecords : [];
      setRows(nextRows);
      setBuiltIns(nextBuiltIns);
      setCompounds(Array.isArray(data.compounds) ? data.compounds : []);
      if (preferred) {
        if (preferred.sourceType === 'admin') {
          const record = nextRows.find((item: AdminRecord) => item.id === Number(preferred.id));
          if (record) setSelected({ sourceType: 'admin', record });
        } else {
          const record = nextBuiltIns.find((item: BuiltInRecord) => item.id === String(preferred.id));
          if (record) setSelected({ sourceType: 'built-in', record });
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load terminology.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setEditForm(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected]);

  useEffect(() => {
    const hasUnsaved = adding && Boolean(form.term.trim());
    const hasEdit = Boolean(editForm);
    if (!hasUnsaved && !hasEdit) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [adding, form.term, editForm]);

  const builtInApproved = builtIns.filter((record) => record.reviewStatus === 'approved' && record.enabled !== false);
  const activeAdmin = rows.filter((row) => row.review_status === 'approved' && row.enabled);

  const visible = useMemo(() => {
    const combined: SelectedRecord[] = [
      ...builtIns.map((record) => ({ sourceType: 'built-in' as const, record })),
      ...rows.map((record) => ({ sourceType: 'admin' as const, record })),
    ];
    const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return combined.filter((item) => {
      if (view === 'built-in' && item.sourceType !== 'built-in') return false;
      if (view === 'admin' && item.sourceType !== 'admin') return false;
      if (view === 'review' && (item.sourceType !== 'admin' || item.record.review_status !== 'review')) return false;
      if (view === 'active') {
        if (item.sourceType === 'built-in' && (item.record.reviewStatus !== 'approved' || item.record.enabled === false)) return false;
        if (item.sourceType === 'admin' && (item.record.review_status !== 'approved' || !item.record.enabled)) return false;
      }
      if (view === 'disabled') {
        if (item.sourceType === 'built-in' && item.record.enabled !== false) return false;
        if (item.sourceType === 'admin' && item.record.enabled) return false;
      }
      if (view === 'recent' && (item.sourceType !== 'admin' || new Date(item.record.created_at).getTime() < recentCutoff)) return false;
      if (!search.trim()) return true;
      const needle = search.trim().toLocaleLowerCase('en-GB');
      const recordText = item.sourceType === 'built-in'
        ? [builtInName(item.record), builtInDestination(item.record), ...(item.record.aliases || []), ...(item.record.abbreviations || []), ...(item.record.misspellings || []), ...(item.record.categories || []), item.record.notes || '']
        : [item.record.term, item.record.display_name || '', item.record.canonical_slug || '', ...(item.record.aliases || []), ...(item.record.misspellings || []), ...(item.record.related_slugs || []), ...(item.record.categories || []), item.record.notes || ''];
      return recordText.join(' ').toLocaleLowerCase('en-GB').includes(needle);
    });
  }, [builtIns, rows, search, view]);

  async function createRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/pearl-terminology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(form)),
      });
      const data = await response.json();
      if (response.status === 409 && data.duplicate) {
        setMessage(data.error || 'That terminology already exists.');
        setAdding(false);
        await load(data.duplicate);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Could not save the record.');
      setForm(emptyForm());
      setAdding(false);
      setMessage('Terminology saved. It will not affect Pearl until it is approved.');
      await load({ sourceType: 'admin', id: data.record.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the record.');
    } finally {
      setSaving(false);
    }
  }

  /* The override row that stands in for a built-in record, if one exists. */
  function overrideForBuiltIn(builtInId: string): AdminRecord | undefined {
    return rows.find((row) => row.supersedes_builtin === builtInId);
  }

  /* Editing a built-in opens the ordinary edit form. If it has been edited
     before, the existing override is loaded so the change carries on from
     where it was; otherwise the form starts from what the built-in says. */
  function startEditBuiltIn(record: BuiltInRecord) {
    const existing = overrideForBuiltIn(record.id);
    setEditForm(existing ? formForRecord(existing) : formForBuiltIn(record));
    setMessage(existing
      ? `Editing your version of ${builtInName(record)}.`
      : `Editing ${builtInName(record)}. Your version replaces the supplied one, and the original is kept so you can put it back.`);
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editForm) return;
    setSaving(true);
    setMessage('');
    try {
      // An edit of a built-in is a NEW override the first time and an update to
      // that same override afterwards. An ordinary admin record is always an update.
      const existingId = selected.sourceType === 'admin'
        ? selected.record.id
        : overrideForBuiltIn(selected.record.id)?.id;
      const response = await fetch(
        existingId ? `/api/admin/pearl-terminology/${existingId}` : '/api/admin/pearl-terminology',
        {
          method: existingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload(editForm)),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the changes.');
      setEditForm(null);
      setMessage(selected.sourceType === 'built-in'
        ? 'Saved. Pearl now uses your version of this term.'
        : 'Terminology record updated.');
      await load({ sourceType: 'admin', id: existingId ?? data.record?.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  }

  /* Put a built-in back exactly as supplied by deleting the override. */
  async function revertBuiltIn(record: BuiltInRecord) {
    const existing = overrideForBuiltIn(record.id);
    if (!existing) return;
    if (!(await confirm({
      title: `Put ${builtInName(record)} back to the version supplied with Pearl?`,
      body: 'Your changes to this term will be removed.',
      confirmLabel: 'Yes, restore it',
      cancelLabel: 'Keep my changes',
      tone: 'danger',
    }))) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/pearl-terminology/${existing.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not put the original back.');
      }
      setEditForm(null);
      setMessage(`${builtInName(record)} is back to the version supplied with Pearl.`);
      await load({ sourceType: 'built-in', id: record.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not put the original back.');
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(row: AdminRecord, changes: Partial<FormState>) {
    const next = { ...formForRecord(row), ...changes };
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/pearl-terminology/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(next)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update the record.');
      setMessage('Terminology record updated.');
      await load({ sourceType: 'admin', id: row.id });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update the record.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(row: AdminRecord) {
    if (!(await confirm({
      title: `Archive “${row.term}”?`,
      body: 'It stops affecting Pearl and stays in the change history.',
      confirmLabel: 'Yes, archive it',
      cancelLabel: 'Keep it active',
    }))) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/admin/pearl-terminology/${row.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete the record.');
      setSelected(null);
      setEditForm(null);
      setMessage('Terminology record archived.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete the record.');
    } finally {
      setSaving(false);
    }
  }

  function startAdditionFromBuiltIn(record: BuiltInRecord) {
    setForm({
      ...emptyForm(),
      canonicalSlug: record.canonicalSlug || record.components?.[0] || '',
      displayName: builtInName(record),
      relatedSlugs: (record.relatedSlugs || []).join(', '),
      categories: (record.categories || []).join(', '),
    });
    setSelected(null);
    setAdding(true);
    setMessage(`Add the new wording Pearl should connect to ${builtInName(record)}.`);
  }

  function exportRecords() {
    const blob = new Blob([JSON.stringify({ builtIn: builtIns, administratorAdded: rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pearl-terminology-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const summaryCards: Array<{ label: string; value: number; target: ViewFilter; hint: string }> = [
    { label: 'Built-in Records', value: builtIns.length, target: 'built-in', hint: 'Protected records supplied with PEARL' },
    { label: 'Admin Records', value: rows.length, target: 'admin', hint: 'Records added through this panel' },
    { label: 'Waiting for Review', value: rows.filter((row) => row.review_status === 'review').length, target: 'review', hint: 'Not active yet' },
    { label: 'Active Entries', value: builtInApproved.length + activeAdmin.length, target: 'active', hint: 'Available to Pearl now' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-stone-50 lg:flex-row">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/admin/research-questions" className="mb-5 inline-flex min-h-10 items-center text-xs font-medium text-stone-500 hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
            ← Pearl Questions
          </Link>

          <header className="flex flex-col gap-4 border-b border-stone-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">Pearl Library Controls</p>
              <h1 className="mt-1 text-2xl font-semibold text-stone-900 text-balance">Pearl Terminology</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-500">
                Review what Pearl recognises, add new wording and correct future gaps without changing the research library.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportRecords} className={smallButton}>Export Records</button>
              <button type="button" onClick={() => { setForm(emptyForm()); setAdding(true); }} className="min-h-10 bg-gold-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                + Add Terminology
              </button>
            </div>
          </header>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => { setSearch(''); setView(card.target); }}
                aria-pressed={view === card.target}
                className={`group min-h-28 border bg-white p-4 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 ${view === card.target ? 'border-gold-500 shadow-sm' : 'border-stone-200'}`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">{card.label}</span>
                <span className="mt-2 block text-3xl font-semibold tabular-nums text-stone-900">{loading ? '-' : card.value}</span>
                <span className="mt-1 block text-xs text-stone-400 group-hover:text-stone-600">{card.hint}</span>
              </button>
            ))}
          </div>

          <p aria-live="polite" className={`mt-4 min-h-5 text-sm ${message.toLowerCase().includes('could not') || message.toLowerCase().includes('already') ? 'text-red-700' : 'text-stone-600'}`}>
            {message}
          </p>

          {adding && (
            <section className="mt-4 border border-gold-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="add-terminology-heading">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="add-terminology-heading" className="text-lg font-semibold text-stone-900">Add Terminology</h2>
                  <p className="mt-1 text-sm text-stone-500">Start with the wording and what Pearl should understand it as.</p>
                </div>
                <button type="button" onClick={() => { setAdding(false); setForm(emptyForm()); }} className={smallButton}>Cancel</button>
              </div>
              <TerminologyForm form={form} setForm={setForm} compounds={compounds} saving={saving} onSubmit={createRecord} submitLabel="Save Terminology" />
            </section>
          )}

          <section className="mt-7" aria-labelledby="terminology-list-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="terminology-list-heading" className="text-base font-semibold text-stone-900">Terminology Records</h2>
                <p className="mt-1 text-xs text-stone-500">Showing {visible.length} records behind this view.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <label className="text-xs font-medium text-stone-600">
                  <span className="sr-only">Search terminology</span>
                  <input
                    type="search"
                    name="terminology-search"
                    autoComplete="off"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search terminology…"
                    className={`${inputClass} mt-0 min-w-64`}
                  />
                </label>
                <label className="text-xs font-medium text-stone-600">
                  <span className="sr-only">Filter terminology</span>
                  <select value={view} onChange={(event) => setView(event.target.value as ViewFilter)} className={`${inputClass} mt-0`}>
                    <option value="all">All Records</option>
                    <option value="built-in">Built-in</option>
                    <option value="admin">Admin-added</option>
                    <option value="review">Waiting for Review</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="recent">Added in the Last 30 Days</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="mt-3 overflow-hidden border border-stone-200 bg-white">
              {loading ? (
                <p className="p-8 text-center text-sm text-stone-400">Loading…</p>
              ) : visible.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm font-medium text-stone-700">No terminology matches this view.</p>
                  <p className="mt-1 text-xs text-stone-400">Clear the search or choose another filter.</p>
                </div>
              ) : visible.map((item) => {
                const name = item.sourceType === 'built-in' ? builtInName(item.record) : item.record.term;
                const destination = item.sourceType === 'built-in' ? builtInDestination(item.record) : (item.record.display_name || item.record.canonical_slug || item.record.component_slugs?.join(', ') || 'Needs a destination');
                const recognised = item.sourceType === 'built-in'
                  ? [...(item.record.aliases || []), ...(item.record.abbreviations || [])].slice(0, 3)
                  : [...(item.record.aliases || []), ...(item.record.misspellings || [])].slice(0, 3);
                const status = item.sourceType === 'built-in'
                  ? (item.record.enabled === false ? 'disabled' : item.record.reviewStatus || 'approved')
                  : (!item.record.enabled ? 'disabled' : item.record.review_status);
                return (
                  <button
                    key={`${item.sourceType}-${item.record.id}`}
                    type="button"
                    onClick={() => { setSelected(item); setEditForm(null); }}
                    className="group flex w-full min-w-0 items-center justify-between gap-4 border-b border-stone-100 px-4 py-4 text-left last:border-b-0 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300 sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-semibold text-stone-900">{name}</span>
                        <span className="bg-stone-100 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500">{item.sourceType === 'built-in' ? `Built-in ${item.record.recordType === 'ambiguous' ? 'clarification' : item.record.recordType}` : 'Admin-added'}</span>
                        <span className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${statusStyle(status)}`}>{status === 'review' ? 'Waiting for Review' : status}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-stone-500">Pearl interprets this as {destination}{recognised.length > 0 ? `. Recognises ${recognised.join(', ')}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-gold-700 group-hover:text-gold-900">View Details →</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      {selected && (
        <RecordDrawer
          selected={selected}
          editForm={editForm}
          setEditForm={setEditForm}
          compounds={compounds}
          saving={saving}
          onClose={() => { setSelected(null); setEditForm(null); }}
          onSave={saveEdit}
          onQuickUpdate={quickUpdate}
          onDelete={deleteRecord}
          onAddWording={startAdditionFromBuiltIn}
          override={selected.sourceType === 'built-in' ? overrideForBuiltIn(selected.record.id) : undefined}
          onEditBuiltIn={startEditBuiltIn}
          onRevertBuiltIn={revertBuiltIn}
        />
      )}
    </div>
  );
}

function TerminologyForm({ form, setForm, compounds, saving, onSubmit, submitLabel }: {
  form: FormState;
  setForm: (next: FormState) => void;
  compounds: Array<{ slug: string; name: string }>;
  saving: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium text-stone-600">Terminology or Abbreviation
          <input required name="term" autoComplete="off" value={form.term} onChange={(event) => setForm({ ...form, term: event.target.value })} className={inputClass} placeholder="For example, RETA…" />
        </label>
        <label className="text-xs font-medium text-stone-600">Type
          <select name="kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Kind })} className={inputClass}>
            <option value="alias">Alternative Name</option>
            <option value="abbreviation">Abbreviation</option>
            <option value="misspelling">Common Misspelling</option>
            <option value="category">Category or Group</option>
            <option value="ambiguous">Needs Clarification</option>
            <option value="blend">Blend or Stack</option>
          </select>
        </label>
        <CompoundPicker
          value={form.canonicalSlug}
          compounds={compounds}
          disabled={form.kind === 'blend' || form.kind === 'ambiguous'}
          onChange={(canonicalSlug) => setForm({ ...form, canonicalSlug })}
        />
        <label className="text-xs font-medium text-stone-600">Alternative Spellings
          <input name="aliases" autoComplete="off" value={form.aliases} onChange={(event) => setForm({ ...form, aliases: event.target.value })} className={inputClass} placeholder="Separate with commas…" />
        </label>
        <label className="text-xs font-medium text-stone-600">Common Misspellings
          <input name="misspellings" autoComplete="off" value={form.misspellings} onChange={(event) => setForm({ ...form, misspellings: event.target.value })} className={inputClass} placeholder="Separate with commas…" />
        </label>
        <label className="text-xs font-medium text-stone-600">Category
          <input name="categories" autoComplete="off" value={form.categories} onChange={(event) => setForm({ ...form, categories: event.target.value })} className={inputClass} placeholder="For example, Recovery…" />
        </label>
      </div>

      <details className="mt-5 border-t border-stone-100 pt-4">
        <summary className="cursor-pointer text-xs font-semibold text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">More Options</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-stone-600">Display Name
            <input name="displayName" autoComplete="off" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} className={inputClass} placeholder="Optional display name…" />
          </label>
          <label className="text-xs font-medium text-stone-600">Related Terminology
            <input name="relatedSlugs" autoComplete="off" value={form.relatedSlugs} onChange={(event) => setForm({ ...form, relatedSlugs: event.target.value })} className={inputClass} placeholder="Separate with commas…" />
          </label>
          <label className="text-xs font-medium text-stone-600">Review Status
            <select name="reviewStatus" value={form.reviewStatus} onChange={(event) => setForm({ ...form, reviewStatus: event.target.value as Status })} className={inputClass}>
              <option value="review">Waiting for Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="text-xs font-medium text-stone-600">Blend Components
            <input name="componentSlugs" autoComplete="off" value={form.componentSlugs} onChange={(event) => setForm({ ...form, componentSlugs: event.target.value })} className={inputClass} placeholder="At least 2 compound names…" disabled={form.kind !== 'blend'} />
          </label>
          <label className="text-xs font-medium text-stone-600">Possible Meanings
            <input name="ambiguousWith" autoComplete="off" value={form.ambiguousWith} onChange={(event) => setForm({ ...form, ambiguousWith: event.target.value })} className={inputClass} placeholder={form.kind === 'category' ? 'Every approved compound in this group…' : 'Possible compound names…'} disabled={form.kind !== 'ambiguous' && form.kind !== 'category'} />
          </label>
          <label className="text-xs font-medium text-stone-600">Confidence
            <select name="confidence" value={form.confidence} onChange={(event) => setForm({ ...form, confidence: event.target.value as Confidence })} className={inputClass}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="text-xs font-medium text-stone-600 sm:col-span-2">Supporting Source Links
            <textarea name="sourceUrls" value={form.sourceUrls} onChange={(event) => setForm({ ...form, sourceUrls: event.target.value })} className={`${inputClass} min-h-24`} placeholder="One secure link per line…" />
            <span className="mt-1 block text-[11px] font-normal text-stone-400">Optional. Add links when they are useful for the record.</span>
          </label>
          <label className="text-xs font-medium text-stone-600">Last Reviewed
            <input type="date" name="lastVerified" value={form.lastVerified} onChange={(event) => setForm({ ...form, lastVerified: event.target.value })} className={inputClass} />
          </label>
          <label className="text-xs font-medium text-stone-600 sm:col-span-2 lg:col-span-3">Notes
            <textarea name="notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`${inputClass} min-h-24`} placeholder="Why Pearl should recognise this wording…" />
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-stone-700">
            <input type="checkbox" name="autoResolve" checked={form.autoResolve} onChange={(event) => setForm({ ...form, autoResolve: event.target.checked })} disabled={form.kind === 'ambiguous' || form.kind === 'category'} className="h-4 w-4 accent-amber-700" />
            Interpret Automatically
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-stone-700">
            <input type="checkbox" name="enabled" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 accent-amber-700" />
            Record Enabled
          </label>
        </div>
      </details>

      <button type="submit" disabled={saving} className="mt-5 min-h-11 bg-gold-700 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 disabled:cursor-wait disabled:opacity-60">
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function CompoundPicker({ value, compounds, disabled, onChange }: {
  value: string;
  compounds: Array<{ slug: string; name: string }>;
  disabled: boolean;
  onChange: (slug: string) => void;
}) {
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = compounds.find((compound) => compound.slug === value) || null;
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('en-GB');
    if (!needle) return compounds;
    return compounds
      .filter((compound) => `${compound.name} ${compound.slug}`.toLocaleLowerCase('en-GB').includes(needle))
      .sort((left, right) => {
        const leftStarts = left.name.toLocaleLowerCase('en-GB').startsWith(needle);
        const rightStarts = right.name.toLocaleLowerCase('en-GB').startsWith(needle);
        return Number(rightStarts) - Number(leftStarts) || left.name.localeCompare(right.name, 'en-GB');
      });
  }, [compounds, query]);

  useEffect(() => {
    const closeWhenClickingAway = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', closeWhenClickingAway);
    return () => document.removeEventListener('pointerdown', closeWhenClickingAway);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery('');
    }
  }, [disabled]);

  const choose = (slug: string) => {
    onChange(slug);
    setOpen(false);
    setQuery('');
  };

  const openPicker = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActiveIndex(0);
  };

  return (
    <div ref={rootRef} className="relative text-xs font-medium text-stone-600">
      <label htmlFor={inputId}>Pearl Should Interpret It As</label>
      <div className="relative">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && filtered[activeIndex] ? `${listId}-${filtered[activeIndex].slug}` : undefined}
          aria-required={!disabled}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : selected?.name || ''}
          onFocus={openPicker}
          onClick={openPicker}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) onChange('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(0, filtered.length - 1)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
            } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
              event.preventDefault();
              choose(filtered[activeIndex].slug);
            } else if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
            } else if (event.key === 'Tab') {
              setOpen(false);
              setQuery('');
            }
          }}
          className={`${inputClass} pr-11 disabled:cursor-not-allowed disabled:bg-stone-100`}
          placeholder={disabled ? 'Not needed for this type' : 'Search compounds...'}
        />
        <button
          type="button"
          aria-label={open ? 'Close compound choices' : 'Show compound choices'}
          disabled={disabled}
          onClick={() => open ? (setOpen(false), setQuery('')) : openPicker()}
          className="absolute inset-y-1 right-1 flex w-9 items-center justify-center text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
      </div>

      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          aria-label="Compound choices"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden border border-gold-300 bg-white shadow-[0_14px_35px_rgba(41,37,36,0.18)]"
        >
          <div className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
            {filtered.length === 1 ? '1 compound' : `${filtered.length} compounds`}
          </div>
          <div className="max-h-72 overflow-y-auto overscroll-contain p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm font-normal text-stone-500">No compounds match that search.</p>
            ) : filtered.map((compound, index) => {
              const isSelected = compound.slug === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={compound.slug}
                  id={`${listId}-${compound.slug}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(compound.slug)}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-normal transition-colors ${isActive ? 'bg-gold-50 text-stone-950' : 'text-stone-700 hover:bg-stone-50'} ${isSelected ? 'font-semibold' : ''}`}
                >
                  <span>{compound.name}</span>
                  {isSelected && <span aria-hidden="true" className="text-gold-800">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordDrawer({ selected, editForm, setEditForm, compounds, saving, onClose, onSave, onQuickUpdate, onDelete, onAddWording, override, onEditBuiltIn, onRevertBuiltIn }: {
  selected: SelectedRecord;
  editForm: FormState | null;
  setEditForm: (next: FormState | null) => void;
  compounds: Array<{ slug: string; name: string }>;
  saving: boolean;
  onClose: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
  onQuickUpdate: (row: AdminRecord, changes: Partial<FormState>) => Promise<void>;
  onDelete: (row: AdminRecord) => Promise<void>;
  onAddWording: (record: BuiltInRecord) => void;
  /* Built-in editing (19 Aug 2026): the override standing in for this built-in,
     if it has been edited, plus the two actions that manage it. */
  override?: AdminRecord;
  onEditBuiltIn: (record: BuiltInRecord) => void;
  onRevertBuiltIn: (record: BuiltInRecord) => Promise<void>;
}) {
  const builtIn = selected.sourceType === 'built-in' ? selected.record : null;
  const admin = selected.sourceType === 'admin' ? selected.record : null;
  const name = builtIn ? builtInName(builtIn) : admin!.term;
  const status = builtIn ? (builtIn.enabled === false ? 'disabled' : builtIn.reviewStatus || 'approved') : (!admin!.enabled ? 'disabled' : admin!.review_status);
  /* When a built-in has been edited, the screen must show the EDITED values,
     or it would tell you your change did not happen. `edited` is the override
     standing in for it; everything below prefers it. */
  const edited = builtIn ? override : undefined;
  const sources = edited ? adminSources(edited.source_urls) : builtIn ? (builtIn.sources || []) : adminSources(admin!.source_urls);
  const aliases = edited ? (edited.aliases || []) : builtIn ? [...(builtIn.aliases || []), ...(builtIn.abbreviations || [])] : (admin!.aliases || []);
  const misspellings = edited ? (edited.misspellings || []) : builtIn ? (builtIn.misspellings || []) : (admin!.misspellings || []);
  const related = edited ? (edited.related_slugs || []) : builtIn ? (builtIn.relatedSlugs || []) : (admin!.related_slugs || []);
  const categories = edited ? (edited.categories || []) : builtIn ? (builtIn.categories || []) : (admin!.categories || []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/35" role="dialog" aria-modal="true" aria-labelledby="terminology-detail-title">
      <button type="button" aria-label="Close terminology details" onClick={onClose} className="absolute inset-0 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-300" />
      <aside className="relative h-full w-full max-w-2xl overflow-y-auto overscroll-contain bg-stone-50 p-4 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="bg-stone-200 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-600">{builtIn ? 'Built-in' : 'Admin-added'}</span>
              <span className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${statusStyle(status)}`}>{status === 'review' ? 'Waiting for Review' : status}</span>
            </div>
            <h2 id="terminology-detail-title" className="mt-3 break-words text-2xl font-semibold text-stone-900 text-balance">{name}</h2>
            <p className="mt-1 text-sm text-stone-500">Pearl interprets this as {builtIn ? builtInDestination(builtIn) : (admin!.display_name || admin!.canonical_slug || admin!.component_slugs?.join(', ') || 'a term requiring clarification')}.</p>
          </div>
          <button type="button" onClick={onClose} className={smallButton}>Close</button>
        </div>

        {editForm ? (
          <section className="mt-6 border border-gold-200 bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-stone-900">{builtIn ? `Edit ${name}` : 'Edit Record'}</h3>
              <button type="button" onClick={() => setEditForm(null)} className={smallButton}>Cancel</button>
            </div>
            <TerminologyForm form={editForm} setForm={setEditForm} compounds={compounds} saving={saving} onSubmit={onSave} submitLabel="Save Changes" />
          </section>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Type" value={edited ? edited.kind : builtIn ? builtIn.recordType : admin!.kind} />
              <Detail label="Confidence" value={edited ? edited.confidence : (builtIn?.confidence || admin!.confidence)} />
              <Detail label="Alternative Names" values={aliases} />
              <Detail label="Common Misspellings" values={misspellings} />
              <Detail label="Related Terms" values={related} />
              <Detail label="Categories" values={categories} />
              <Detail label="Created" value={builtIn ? 'Supplied with Pearl' : displayDate(admin!.created_at)} />
              <Detail label={builtIn && !edited ? 'Last Reviewed' : 'Last Updated'} value={edited ? displayDate(edited.updated_at) : builtIn ? displayDate(builtIn.lastVerified) : displayDate(admin!.updated_at)} />
            </div>

            {(edited?.notes || builtIn?.notes || admin?.notes) && (
              <section className="mt-5 border border-stone-200 bg-white p-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">How Pearl Uses It</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-700">{edited?.notes || builtIn?.notes || admin?.notes}</p>
              </section>
            )}

            <section className="mt-5 border border-stone-200 bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Sources</h3>
              {sources.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">No source has been added. Sources are optional for administrator terminology.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {sources.map((source) => (
                    <li key={source.url} className="min-w-0">
                      <a href={source.url} target="_blank" rel="noreferrer" className="break-words text-sm font-medium text-gold-800 underline decoration-gold-300 underline-offset-2 hover:text-gold-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                        {source.label || source.url}
                      </a>
                      {source.role && <p className="text-xs text-stone-400">{source.role}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="mt-6 flex flex-wrap gap-2">
              {builtIn ? (
                <>
                  <button type="button" onClick={() => onEditBuiltIn(builtIn)} className="min-h-11 bg-gold-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                    {edited ? 'Edit Your Version' : 'Edit This Record'}
                  </button>
                  <button type="button" onClick={() => onAddWording(builtIn)} className={smallButton}>Add Wording Instead</button>
                  {edited && (
                    <button type="button" disabled={saving} onClick={() => void onRevertBuiltIn(builtIn)} className="min-h-10 border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                      Put the Original Back
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setEditForm(formForRecord(admin!))} className="min-h-11 bg-gold-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">Edit Record</button>
                  {admin!.review_status !== 'approved' && <button type="button" disabled={saving} onClick={() => void onQuickUpdate(admin!, { reviewStatus: 'approved', enabled: true })} className={smallButton}>Approve</button>}
                  <button type="button" disabled={saving} onClick={() => void onQuickUpdate(admin!, { enabled: !admin!.enabled })} className={smallButton}>{admin!.enabled ? 'Disable' : 'Enable'}</button>
                  <button type="button" disabled={saving} onClick={() => void onDelete(admin!)} className="min-h-10 border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300">Delete Record</button>
                </>
              )}
            </div>
            {builtIn && (
              <p className="mt-3 text-xs leading-relaxed text-stone-400">
                {edited
                  ? 'You have edited this record, and Pearl is using your version. The one supplied with Pearl is kept underneath, so “Put the Original Back” restores it exactly.'
                  : 'You can edit this record. Your version is saved separately and the one supplied with Pearl is kept underneath, so you can always put the original back. “Add Wording” instead creates a new term pointing at the same compound.'}
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Detail({ label, value, values }: { label: string; value?: string; values?: string[] }) {
  const clean = (values || []).filter(Boolean);
  return (
    <div className="border border-stone-200 bg-white p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</div>
      {clean.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {clean.map((item) => <span key={item} className="break-words bg-stone-100 px-2 py-1 text-xs text-stone-700">{item}</span>)}
        </div>
      ) : (
        <div className="mt-2 break-words text-sm capitalize text-stone-700">{value || 'None recorded'}</div>
      )}
    </div>
  );
}
