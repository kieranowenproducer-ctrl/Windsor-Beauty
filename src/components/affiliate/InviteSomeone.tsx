'use client';

import { useRef, useState } from 'react';
import {
  INVITATION_CAN_RESEND,
  INVITATION_STATE_LABEL,
  INVITATION_STATE_TONE,
  smsShareUrl,
  whatsappShareUrl,
} from '@/lib/affiliateInvitationLabels';

export type InvitationRow = {
  id: number | string;
  recipient_email: string;
  created_source: string;
  created_at: string;
  state: string;
};

type Result = {
  link: string;
  shareMessage: string;
  recipientEmail: string;
  expiresAt: string;
  email: 'sent' | 'not_sent' | 'not_requested';
};

const EYEBROW = 'text-[9px] tracking-[0.38em] uppercase text-gold-700';
const LABEL = 'text-[9px] tracking-[0.18em] uppercase text-stone-500';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700';
const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const longDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * The affiliate's invitation panel. They type the person's email and press Send: Windsor Beauty emails them
 * from info@windsorbeauty.co.uk. Whatever happens to that email, the same link comes straight back with
 * WhatsApp, text-message and copy buttons, so they can always send it from their own phone.
 */
export default function InviteSomeone({ preview, invitations, onChanged }: {
  preview: boolean;
  invitations: InvitationRow[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [requestPageLink, setRequestPageLink] = useState('');
  const [previewRows, setPreviewRows] = useState<InvitationRow[]>([]);
  const panel = useRef<HTMLElement>(null);

  async function invite(recipientEmail: string, send: boolean) {
    setBusy(true);
    setError('');
    setNote('');
    setResult(null);
    try {
      const response = await fetch(`/api/account/affiliate/invitations${preview ? '?preview=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: recipientEmail.trim(), send }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.link) throw new Error(json?.error || 'The invitation could not be made. Please try again.');
      setResult(json as Result);
      setEmail('');
      if (preview) {
        setPreviewRows(rows => [{ id: `preview-${Date.now()}`, recipient_email: json.recipientEmail, created_source: 'affiliate', created_at: new Date().toISOString(), state: json.email === 'sent' ? 'sent' : json.email === 'not_sent' ? 'email_failed' : 'link_only' }, ...rows]);
      } else {
        onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invitation could not be made. Please try again.');
    } finally {
      setBusy(false);
      panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function getRequestPage() {
    setNote('');
    try {
      const response = await fetch(`/api/account/affiliate/request-link${preview ? '?preview=1' : ''}`, { method: 'POST' });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.link) throw new Error(json?.error || 'The request page could not be opened.');
      setRequestPageLink(preview ? `${json.link}?preview=1` : json.link);
    } catch (err) { setNote(err instanceof Error ? err.message : 'The request page could not be opened.'); }
  }

  function copy(text: string, done: string) {
    navigator.clipboard.writeText(text).then(() => setNote(done)).catch(() => setNote('Press and hold the link to copy it.'));
  }

  const rows = [...previewRows, ...invitations];

  return (
    <>
      <section ref={panel} className="mb-8 scroll-mt-6 border border-gold-200 bg-gold-50/60 px-5 py-6 sm:px-7" aria-labelledby="invite-heading">
        <p className={EYEBROW}>Invite someone</p>
        <h2 id="invite-heading" className="mt-1 font-serif text-2xl text-stone-800">Send a private invitation</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
          Type their email address and press Send. Windsor Beauty emails them everything they need to join, with 10% off their first order.
        </p>

        <form onSubmit={event => { event.preventDefault(); invite(email, true); }} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className={LABEL} htmlFor="invite-email">Their email address</label>
            <input id="invite-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={busy}
              className="mt-2 min-h-12 w-full border border-gold-200 bg-white px-3 text-base text-stone-800 outline-none focus:border-gold-600 focus:ring-1 focus:ring-gold-600" />
          </div>
          <button type="submit" disabled={busy} className={`min-h-12 bg-gold-700 px-6 text-sm font-semibold text-white hover:bg-gold-800 disabled:opacity-50 ${FOCUS}`}>
            {busy ? 'Sending' : 'Send invitation'}
          </button>
        </form>

        {error && <p role="alert" className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">{error}</p>}

        {result && (
          <div className="mt-5 border border-gold-200 bg-white p-4 sm:p-5" role="status">
            {result.email === 'sent' && <p className="text-sm font-semibold text-green-800">Invitation emailed to {result.recipientEmail}.</p>}
            {result.email === 'not_sent' && <p className="text-sm font-semibold text-amber-900">The email to {result.recipientEmail} did not go through. Send the link from your phone instead.</p>}
            {result.email === 'not_requested' && <p className="text-sm font-semibold text-stone-800">Link ready for {result.recipientEmail}. No email was sent.</p>}
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              {result.email === 'sent' ? 'Want to make sure they see it? Send it from your phone as well:' : 'Send it from your phone:'}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <a href={whatsappShareUrl(result.shareMessage)} target="_blank" rel="noopener" className={`flex min-h-12 items-center justify-center gap-2 bg-[#1f7a4d] px-4 text-sm font-semibold text-white hover:bg-[#186540] ${FOCUS}`}>WhatsApp</a>
              <a href={smsShareUrl(result.shareMessage)} className={`flex min-h-12 items-center justify-center border border-stone-800 px-4 text-sm font-semibold text-stone-800 hover:bg-stone-50 ${FOCUS}`}>Text message</a>
              <button type="button" onClick={() => copy(result.shareMessage, 'Message copied. Paste it anywhere.')} className={`min-h-12 border border-gold-700 px-4 text-sm font-semibold text-gold-800 hover:bg-gold-50 ${FOCUS}`}>Copy message</button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
              The link works once, only for {result.recipientEmail}, until {longDate(result.expiresAt)}.
              {' '}<button type="button" onClick={() => copy(result.link, 'Link copied.')} className="underline underline-offset-2 hover:text-stone-700">Copy the link on its own</button>
            </p>
          </div>
        )}

        {note && <p role="status" className="mt-3 text-xs leading-relaxed text-stone-700">{note}</p>}

        <details className="mt-6 border-t border-gold-200 pt-4 text-xs text-stone-600">
          <summary className="cursor-pointer select-none font-semibold text-stone-700">Other ways to invite</summary>
          <div className="mt-4 space-y-5">
            <div>
              <p className="font-semibold text-stone-700">Just give me the link, do not email them</p>
              <p className="mt-1 leading-relaxed">Makes the same one-person link for you to send yourself. Type their email above first.</p>
              <button type="button" disabled={busy || !email.trim()} onClick={() => invite(email, false)} className={`mt-2 min-h-11 border border-gold-700 px-4 font-semibold text-gold-800 hover:bg-white disabled:opacity-50 ${FOCUS}`}>Make a link only</button>
            </div>
            <div>
              <p className="font-semibold text-stone-700">Your request page</p>
              <p className="mt-1 leading-relaxed">One page you can share with anyone. They type their own email and we send them the invitation. Useful when you do not know their email.</p>
              <button type="button" onClick={getRequestPage} className={`mt-2 min-h-11 border border-gold-700 px-4 font-semibold text-gold-800 hover:bg-white ${FOCUS}`}>Get my request page</button>
              {requestPageLink && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input aria-label="Your invitation request page" readOnly value={requestPageLink} onFocus={event => event.target.select()} className="min-w-0 flex-1 border border-gold-200 bg-white px-3 py-2.5 text-xs text-stone-700" />
                <button type="button" onClick={() => copy(requestPageLink, 'Request page copied.')} className={`min-h-11 border border-gold-700 px-4 font-semibold text-gold-800 ${FOCUS}`}>Copy page</button>
              </div>}
            </div>
          </div>
        </details>
      </section>

      <section className="mb-12" aria-labelledby="invited-heading">
        <h2 id="invited-heading" className="mb-1 font-serif text-2xl text-stone-800">People you have invited</h2>
        <p className="mb-5 text-xs text-stone-500">Whether each invitation arrived and who has joined. If an email did not arrive, send a new link.</p>
        {rows.length === 0 ? (
          <div className="border border-gold-100 bg-white p-6 text-center text-sm text-stone-500">Nobody invited yet. Your invitations appear here.</div>
        ) : (
          <ul className="divide-y divide-gold-100 border border-gold-100 bg-white">
            {rows.map(row => (
              <li key={String(row.id)} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="break-all text-sm text-stone-800">{row.recipient_email}</p>
                  <p className="text-[11px] text-stone-500">{row.created_source === 'recipient' ? 'Asked on your request page' : 'Invited'} on {shortDate(row.created_at)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className={`px-2 py-1 text-[11px] font-semibold ${INVITATION_STATE_TONE[row.state] || 'bg-stone-100 text-stone-700'}`}>{INVITATION_STATE_LABEL[row.state] || row.state}</span>
                  {row.created_source !== 'recipient' && INVITATION_CAN_RESEND.has(row.state) && (
                    row.state === 'email_failed' || row.state === 'expired'
                      ? <button type="button" disabled={busy} onClick={() => invite(row.recipient_email, true)} className={`min-h-10 border border-gold-700 px-3 text-xs font-semibold text-gold-800 hover:bg-gold-50 disabled:opacity-50 ${FOCUS}`}>Send a new link</button>
                      : <button type="button" disabled={busy} onClick={() => invite(row.recipient_email, true)} className={`min-h-10 px-2 text-xs text-stone-500 underline underline-offset-2 hover:text-stone-800 disabled:opacity-50 ${FOCUS}`}>Send again</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
