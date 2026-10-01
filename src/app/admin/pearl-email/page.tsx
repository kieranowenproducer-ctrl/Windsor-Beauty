'use client';

// The PEARL email wording, editable without a developer (task 3a5298f5).
//
// Kieran, 9 September: "Make the wording editable, one screen where you edit the
// standard letter and it applies to every PEARL reply."
//
// Before this, the letter around PEARL's answer lived in the code, so changing
// "Welcome to Windsor Glow" was a developer job. It is saved into site_content
// under 'pearl-email' through the content API that already existed for the
// subscriber announcement email, so nothing new had to be invented to store it.
//
// Two things are deliberately NOT edited here, because they change per customer:
// their name, and PEARL's answer. Those are marked in the letter and filled in
// on the Website Enquiries screen when the reply is written.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import PearlDrafts from './PearlDrafts';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import {
  PEARL_NAME_TOKEN,
  PEARL_REPLY_END,
  PEARL_REPLY_START,
  buildPearlReplyTemplate,
  defaultPearlLetter,
  parsePearlReply,
} from '@/lib/email/pearlReplyTemplate';

const SAMPLE_TITLE = 'HGH 191AA research ranges';
const SAMPLE_ANSWER =
  "PEARL's approved sources list HGH 191AA on a daily schedule, rather than a weekly schedule.\n\n" +
  'Lower source range: 1-2 IU per day\n' +
  'Standard source range: 2-4 IU per day\n' +
  'Higher source range: 4-6 IU per day, split';

export default function PearlEmailPage() {
  const confirm = useConfirm();
  const [letter, setLetter] = useState('');
  const [savedLetter, setSavedLetter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/content')
      .then(r => r.json())
      .then(d => {
        const row = (d.content ?? []).find((c: { key: string }) => c.key === 'pearl-email');
        const body = typeof row?.body === 'string' ? row.body : '';
        // Empty means nobody has edited it, so show the wording that is going
        // out today rather than a blank box.
        const start = body.trim() || defaultPearlLetter();
        setLetter(start);
        setSavedLetter(start);
      })
      .catch(() => setError('Could not load the wording. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  const parsed = parsePearlReply(letter);
  const missingMarkers = !parsed;
  const missingName = !letter.includes(PEARL_NAME_TOKEN);
  const changed = letter !== savedLetter;

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // The content API reads the text from 'body', not 'content'. Sending
        // the wrong field saved an empty letter and still answered 200, which
        // the evidence run caught before this shipped.
        body: JSON.stringify({ key: 'pearl-email', body: letter, format: 'text' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Could not save that. Please try again.');
        return;
      }
      setSavedLetter(letter);
      setMessage('Saved. Every PEARL reply from now on uses this wording.');
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // What the customer actually receives, built the same way the real send does.
  const previewText = buildPearlReplyTemplate('Yvonne', SAMPLE_TITLE, SAMPLE_ANSWER, letter);
  const previewParsed = parsePearlReply(previewText);

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-5xl">
          <h1 className="text-lg font-semibold text-stone-800">PEARL Email</h1>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-2xl">
            The standard letter that wraps every PEARL answer. Edit it here and every PEARL reply
            sent from{' '}
            <Link href="/admin/enquiries" className="text-gold-700 underline">Website Enquiries</Link>{' '}
            uses it from then on. Nothing a customer sees changes until you press Save.
          </p>

          {loading ? (
            <p className="text-xs text-stone-400 mt-8">Loading the wording...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">

              {/* The editor */}
              <div className="bg-white border border-stone-200 p-5">
                <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-3">The Letter</p>

                <div className="bg-stone-50 border border-stone-100 p-3 mb-3 text-[10px] text-stone-600 leading-relaxed">
                  <p className="mb-1.5">Two things are filled in for each customer, so leave them where they are:</p>
                  <p className="mb-1">
                    <code className="bg-white border border-stone-200 px-1 py-0.5">{PEARL_NAME_TOKEN}</code>{' '}
                    becomes their first name.
                  </p>
                  <p>
                    Everything between{' '}
                    <code className="bg-white border border-stone-200 px-1 py-0.5">{PEARL_REPLY_START}</code>{' '}
                    and{' '}
                    <code className="bg-white border border-stone-200 px-1 py-0.5">{PEARL_REPLY_END}</code>{' '}
                    is replaced by PEARL&rsquo;s answer, and appears in the gold box.
                  </p>
                </div>

                <textarea
                  value={letter}
                  onChange={e => setLetter(e.target.value)}
                  disabled={saving}
                  rows={26}
                  spellCheck
                  aria-label="The standard PEARL letter"
                  className="w-full border border-stone-200 focus:border-gold-400 outline-none p-3 text-xs text-stone-700 leading-relaxed font-mono transition-colors disabled:opacity-50"
                />

                {missingMarkers && (
                  <p className="text-[10px] text-red-600 mt-2 leading-relaxed">
                    The two PEARL lines are missing, so there is nowhere to put the answer. Put
                    {' '}{PEARL_REPLY_START} and {PEARL_REPLY_END} back, or press Reset.
                  </p>
                )}
                {missingName && !missingMarkers && (
                  <p className="text-[10px] text-amber-600 mt-2 leading-relaxed">
                    {PEARL_NAME_TOKEN} is missing, so nobody will be greeted by name. Save it that way
                    if you meant to.
                  </p>
                )}
                {error && <p className="text-[10px] text-red-600 mt-2">{error}</p>}
                {message && <p className="text-[10px] text-green-700 mt-2">{message}</p>}

                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving || missingMarkers || !changed}
                    className="min-h-11 text-[9px] tracking-[0.18em] uppercase bg-gold-700 text-white px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-40"
                  >
                    {saving ? 'Saving...' : changed ? 'Save the wording' : 'Saved'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLetter(savedLetter); setMessage(''); setError(''); }}
                    disabled={saving || !changed}
                    className="min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-200 text-stone-500 px-5 py-2.5 hover:border-stone-300 transition-colors disabled:opacity-40"
                  >
                    Undo my changes
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!(await confirm({
                        title: 'Put the wording back to the original Windsor Glow letter?',
                        body: 'Anything you have written here is replaced. Nothing is saved until you press Save.',
                        confirmLabel: 'Yes, restore it',
                        cancelLabel: 'Keep my wording',
                        tone: 'danger',
                      }))) return;
                      setLetter(defaultPearlLetter());
                      setMessage('');
                      setError('');
                    }}
                    disabled={saving}
                    className="min-h-11 text-[9px] tracking-[0.18em] uppercase border border-stone-200 text-stone-500 px-5 py-2.5 hover:border-stone-300 transition-colors disabled:opacity-40"
                  >
                    Reset to the original
                  </button>
                </div>
              </div>

              {/* What the customer gets */}
              <div className="bg-white border border-stone-200 p-5">
                <p className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-1">Preview</p>
                <p className="text-[10px] text-stone-400 mb-4 leading-relaxed">
                  A customer called Yvonne, with a real PEARL answer dropped in. The finished email
                  also carries the black Windsor Glow header, the logo and the research-use footer.
                </p>

                {previewParsed ? (
                  <div className="border border-stone-100">
                    <div className="bg-[#16140f] px-5 py-6 text-center">
                      {/* The email's own palette, not an admin token: this block reproduces the
                          dark header a customer sees. gold-500 is an admin text colour meant for
                          white backgrounds and check:contrast rightly refuses it there. */}
                      <p className="text-[#e0b64a] text-sm font-serif tracking-wide">Windsor Glow</p>
                      <p className="text-[8px] tracking-[0.25em] uppercase text-stone-300 mt-2">Product Information</p>
                    </div>
                    <div className="p-5 space-y-3">
                      {previewParsed.before.split(/\n{2,}/).filter(Boolean).map((block, i) => (
                        <p key={`b${i}`} className="text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap">{block}</p>
                      ))}
                      <div className="bg-[#fefce8] border border-[#e7dcc8] p-4">
                        <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 mb-2">
                          {previewParsed.pearl.split('\n')[0]}
                        </p>
                        <p className="text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap">
                          {previewParsed.pearl.split('\n').slice(1).join('\n').trim()}
                        </p>
                      </div>
                      {previewParsed.after.split(/\n{2,}/).filter(Boolean).map((block, i) => (
                        <p key={`a${i}`} className="text-[11px] text-stone-600 leading-relaxed whitespace-pre-wrap">{block}</p>
                      ))}
                    </div>
                    <div className="bg-stone-50 px-5 py-4 text-center border-t border-stone-100">
                      <p className="text-[9px] text-stone-400">Windsor Glow &mdash; windsorglow.com</p>
                      <p className="text-[9px] text-stone-300 mt-1">
                        All products are supplied strictly for research purposes only. Not for human use.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-stone-400">
                    The preview comes back once the two PEARL lines are in the letter.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Drafted emails to real people, saved and sendable (task 9add1201). */}
          <PearlDrafts />
        </div>
      </main>
    </div>
  );
}
