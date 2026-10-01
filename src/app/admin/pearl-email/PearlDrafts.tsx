'use client';

// Drafted PEARL emails, saved on the dashboard (task 9add1201).
//
// Kieran: "PEARL dashboard emails should have draft emails saved, which either
// I draft or I've asked you to draft, and there should be a Save button on there
// and a Send button on there where you can actually put the customer's email on
// there." And: "Any emails drafted on PEARL's dashboard must look identical to
// how they appear to a customer with the background etc."
//
// So every draft shows the real email, drawn by the same renderer that sends it.
// The preview here is not a mock-up of the email; it is the email.

import { useCallback, useEffect, useState } from 'react';
import { defaultPearlLetter } from '@/lib/email/pearlReplyTemplate';
import { useConfirm } from '@/components/admin/ConfirmProvider';

export interface PearlDraft {
  id: number;
  customer_name: string;
  customer_email: string;
  pearl_title: string;
  pearl_answer: string;
  subject: string | null;
  letter_override: string | null;
  updated_at: string;
  sent_at: string | null;
}

const inputClass =
  'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-700 bg-white transition-colors disabled:opacity-50';

function formatWhen(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function PearlDrafts() {
  const confirm = useConfirm();
  const [drafts, setDrafts] = useState<PearlDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState({ customerName: '', customerEmail: '', pearlTitle: '', pearlAnswer: '' });
  // This draft's own wrapper letter. Empty means it uses the standard one
  // from the top of this screen (task 9add1201).
  const [override, setOverride] = useState('');
  const [standardLetter, setStandardLetter] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // The finished email, fetched from the server so it is drawn by the very code
  // that sends it. Rendering it again in the browser would be a second copy,
  // which is the thing this is meant to prevent.
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return fetch('/api/admin/pearl-emails')
      .then(r => r.json())
      .then(d => setDrafts(Array.isArray(d.drafts) ? d.drafts : []))
      .catch(() => setNote({ ok: false, text: 'Could not load the drafts. Please refresh.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch('/api/admin/content')
      .then(r => r.json())
      .then(d => {
        const row = (d.content ?? []).find((c: { key: string }) => c.key === 'pearl-email');
        const saved = typeof row?.body === 'string' ? row.body.trim() : '';
        // Empty means nobody has edited the standard letter, so the built-in
        // wording is what is going out. Without this the button below had
        // nothing to copy in and appeared to do nothing.
        setStandardLetter(saved || defaultPearlLetter());
      })
      .catch(() => setStandardLetter(defaultPearlLetter()));
  }, []);

  // Ask the server what this draft looks like, whenever it changes.
  useEffect(() => {
    if (openId === null) { setPreviewHtml(''); return; }
    if (!form.pearlTitle.trim() && !form.pearlAnswer.trim()) { setPreviewHtml(''); return; }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(() => {
      fetch('/api/admin/pearl-emails/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          pearlTitle: form.pearlTitle,
          pearlAnswer: form.pearlAnswer,
          letterOverride: override,
        }),
      })
        .then(r => r.json())
        .then(d => { if (!cancelled) setPreviewHtml(typeof d.html === 'string' ? d.html : ''); })
        .catch(() => { if (!cancelled) setPreviewHtml(''); })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [openId, form.customerName, form.pearlTitle, form.pearlAnswer, override]);

  function openDraft(d: PearlDraft) {
    setOpenId(d.id);
    setForm({
      customerName: d.customer_name, customerEmail: d.customer_email,
      pearlTitle: d.pearl_title, pearlAnswer: d.pearl_answer,
    });
    setOverride(d.letter_override ?? '');
    setNote(null);
  }

  function startNew() {
    setOpenId('new');
    setForm({ customerName: '', customerEmail: '', pearlTitle: '', pearlAnswer: '' });
    setOverride('');
    setNote(null);
  }

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch('/api/admin/pearl-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: openId === 'new' ? null : openId,
          customerName: form.customerName,
          customerEmail: form.customerEmail,
          pearlTitle: form.pearlTitle,
          pearlAnswer: form.pearlAnswer,
          letterOverride: override,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setNote({ ok: false, text: data?.error || 'That did not save.' }); return; }
      setOpenId(data.draft.id);
      setNote({ ok: true, text: 'Saved.' });
      await load();
    } catch {
      setNote({ ok: false, text: 'Could not reach the server.' });
    } finally { setBusy(false); }
  }

  async function send() {
    if (openId === null || openId === 'new') {
      setNote({ ok: false, text: 'Save it first, then send.' });
      return;
    }
    if (!(await confirm({
      title: `Send this to ${form.customerEmail}?`,
      body: 'It goes out as Windsor Glow, exactly as shown on the right.',
      confirmLabel: 'Yes, send it',
      cancelLabel: 'Not yet',
    }))) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/admin/pearl-emails/${openId}/send`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setNote({ ok: false, text: data?.error || 'It would not send.' }); return; }
      setNote({ ok: true, text: data?.message || 'Sent.' });
      await load();
    } catch {
      setNote({ ok: false, text: 'Could not reach the server.' });
    } finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!(await confirm({
      title: 'Delete this draft?',
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/pearl-emails?id=${id}`, { method: 'DELETE' });
      if (openId === id) { setOpenId(null); }
      await load();
    } finally { setBusy(false); }
  }

  const openDraftRow = typeof openId === 'number' ? drafts.find(d => d.id === openId) : null;
  const alreadySent = Boolean(openDraftRow?.sent_at);

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-base font-semibold text-stone-800">Drafted emails</h2>
        <button
          type="button"
          onClick={startNew}
          className="min-h-11 text-[9px] tracking-[0.18em] uppercase border border-gold-300 text-gold-700 px-4 py-2.5 hover:bg-gold-50 transition-colors"
        >
          Write a new one
        </button>
      </div>
      <p className="text-xs text-stone-500 mb-5 max-w-2xl leading-relaxed">
        Emails waiting to go, saved here until you send them. Put the customer&rsquo;s address on,
        write PEARL&rsquo;s answer, and press Send. What you see on the right is exactly what lands
        in their inbox.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* The list, and the one being edited */}
        <div className="space-y-4">
          <div className="bg-white border border-stone-200">
            {loading ? (
              <p className="text-xs text-stone-400 p-5">Loading...</p>
            ) : drafts.length === 0 ? (
              <p className="text-xs text-stone-400 p-5">
                Nothing drafted yet. Press &ldquo;Write a new one&rdquo; to start.
              </p>
            ) : (
              <div className="divide-y divide-stone-100">
                {drafts.map(d => (
                  <div key={d.id} className={`flex items-start gap-3 px-4 py-3 ${openId === d.id ? 'bg-gold-50/50' : ''}`}>
                    <button
                      type="button"
                      onClick={() => openDraft(d)}
                      className="flex-1 text-left min-h-11"
                    >
                      <p className="text-xs font-medium text-stone-700">
                        {d.pearl_title || '(no title yet)'}
                      </p>
                      <p className="text-[10px] text-stone-400 mt-0.5">
                        {d.customer_name || 'No name'} · {d.customer_email || 'no address yet'}
                      </p>
                      <p className="text-[9px] text-stone-400 mt-1">
                        {d.sent_at
                          ? <span className="text-green-600">Sent {formatWhen(d.sent_at)}</span>
                          : `Saved ${formatWhen(d.updated_at)}`}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(d.id)}
                      disabled={busy}
                      aria-label="Delete this draft"
                      className="shrink-0 min-h-11 text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-600 px-2 transition-colors disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {openId !== null && (
            <div className="bg-white border border-gold-300 p-5 space-y-3">
              <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400">
                {openId === 'new' ? 'New email' : alreadySent ? 'Already sent' : 'Editing'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pd-name" className="block text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Their name</label>
                  <input id="pd-name" type="text" className={inputClass} disabled={busy || alreadySent}
                    value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="pd-email" className="block text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Their email address</label>
                  <input id="pd-email" type="email" className={inputClass} disabled={busy || alreadySent}
                    value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
                </div>
              </div>

              <div>
                <label htmlFor="pd-title" className="block text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">What it is about</label>
                <input id="pd-title" type="text" className={inputClass} disabled={busy || alreadySent}
                  placeholder="e.g. HGH 191AA research ranges"
                  value={form.pearlTitle} onChange={e => setForm(f => ({ ...f, pearlTitle: e.target.value }))} />
              </div>

              <div>
                <label htmlFor="pd-answer" className="block text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">PEARL&rsquo;s answer</label>
                <textarea id="pd-answer" rows={10} className={inputClass} disabled={busy || alreadySent}
                  placeholder="The source-listed answer, checked before it goes."
                  value={form.pearlAnswer} onChange={e => setForm(f => ({ ...f, pearlAnswer: e.target.value }))} />
              </div>

              {/* Per-draft wording (task 9add1201, Kieran: "allow an override on
                  every draft"). Off by default, so a draft keeps using the one
                  standard letter unless this email genuinely needs to read
                  differently. Starts from the standard wording rather than an
                  empty box, so it is an edit and not a rewrite. */}
              <div className="border-t border-stone-100 pt-3">
                {override ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-gold-700">
                        This email has its own wording
                      </p>
                      <button
                        type="button"
                        disabled={busy || alreadySent}
                        onClick={async () => {
                          if (!(await confirm({
                            title: 'Go back to the standard letter for this email?',
                            body: 'Your own wording for it is discarded.',
                            confirmLabel: 'Yes, use the standard letter',
                            cancelLabel: 'Keep my wording',
                            tone: 'danger',
                          }))) return;
                          setOverride('');
                        }}
                        className="min-h-11 text-[9px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors disabled:opacity-40"
                      >
                        Use the standard letter instead
                      </button>
                    </div>
                    <textarea
                      rows={12}
                      aria-label="This email's own wording"
                      className={`${inputClass} font-mono leading-relaxed`}
                      disabled={busy || alreadySent}
                      value={override}
                      onChange={e => setOverride(e.target.value)}
                    />
                    <p className="text-[9px] text-stone-400 mt-1.5 leading-relaxed">
                      Only this email uses this. Keep {'{{NAME}}'} and the two PEARL lines where they
                      are: the name and the answer are still filled in for you.
                    </p>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[10px] text-stone-500">
                      Using the standard letter from the top of this page.
                    </p>
                    <button
                      type="button"
                      disabled={busy || alreadySent}
                      onClick={() => setOverride(standardLetter || defaultPearlLetter())}
                      className="min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-200 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
                    >
                      Write different wording for this one
                    </button>
                  </div>
                )}
              </div>

              {note && (
                <p className={`text-[10px] ${note.ok ? 'text-green-700' : 'text-red-600'}`}>{note.text}</p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={save} disabled={busy || alreadySent}
                  className="min-h-11 text-[9px] tracking-[0.18em] uppercase bg-stone-700 text-white px-5 py-2.5 hover:bg-stone-800 transition-colors disabled:opacity-40">
                  {busy ? 'Working...' : 'Save'}
                </button>
                <button type="button" onClick={send} disabled={busy || alreadySent || openId === 'new' || !form.customerEmail.trim()}
                  className="min-h-11 text-[9px] tracking-[0.18em] uppercase bg-gold-700 text-white px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-40">
                  {alreadySent ? 'Sent' : busy ? 'Working...' : 'Send to the customer'}
                </button>
                <button type="button" onClick={() => { setOpenId(null); setNote(null); }} disabled={busy}
                  className="min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-200 text-stone-500 px-5 py-2.5 hover:border-stone-300 transition-colors disabled:opacity-40">
                  Close
                </button>
              </div>
              {openId === 'new' && (
                <p className="text-[9px] text-stone-400">Save it once and the Send button turns on.</p>
              )}
            </div>
          )}
        </div>

        {/* Exactly what the customer receives */}
        <div className="bg-white border border-stone-200 p-5">
          <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-1">What the customer sees</p>
          <p className="text-[10px] text-stone-400 mb-4 leading-relaxed">
            Drawn by the same code that sends it, so this is the email itself rather than an
            impression of it.
          </p>
          {openId === null ? (
            <p className="text-[10px] text-stone-400">Open a draft on the left to see it.</p>
          ) : previewHtml ? (
            <iframe
              title="What the customer sees"
              srcDoc={previewHtml}
              className="w-full h-[620px] border border-stone-100 bg-white"
            />
          ) : (
            <p className="text-[10px] text-stone-400">
              {previewing ? 'Drawing it...' : 'Fill in the title and the answer to see the email.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
