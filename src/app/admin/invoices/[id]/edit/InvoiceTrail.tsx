'use client';

import { useEffect, useState } from 'react';
import type { InvoiceTrailEvent } from '@/lib/invoiceTrail';

const date = (value: string) => new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });

export default function InvoiceTrail({ invoiceId, refreshKey }: { invoiceId: string; refreshKey: string }) {
  const [events, setEvents] = useState<InvoiceTrailEvent[] | null>(null);
  const [error, setError] = useState('');
  const [archiveAvailable, setArchiveAvailable] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setEvents(null);
    setError('');
    fetch(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/trail`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.events)) throw new Error('The invoice history could not be loaded.');
        if (!controller.signal.aborted) { setEvents(body.events); setArchiveAvailable(body.emailHistoryAvailable !== false); }
      })
      .catch(() => { if (!controller.signal.aborted) { setEvents(null); setError('The invoice history could not be loaded.'); } });
    return () => controller.abort();
  }, [invoiceId, refreshKey, retry]);

  return <section className="bg-white border border-stone-200 p-5 mb-6" aria-labelledby="invoice-history-heading">
    <h2 id="invoice-history-heading" className="text-sm font-semibold text-stone-800">Invoice history</h2>
    <p className="mt-1 mb-4 text-xs text-stone-500">Saved events, oldest first. Times are UK time. This view does not send emails or change the invoice.</p>
    {error ? <div role="alert" className="text-sm text-red-700">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="underline min-h-11 ml-2">Try again</button></div>
      : !events ? <p className="text-sm text-stone-500" role="status">Loading history...</p>
      : <>
        {!archiveAvailable && <p role="status" className="mb-4 text-sm text-stone-600">Saved email history is unavailable. The invoice and order events are shown below.</p>}
        <ol className="space-y-4">{events.map(event => <li key={event.key} className="border-l-2 border-stone-200 pl-4">
          <p className={`text-sm font-medium ${event.tone === 'bad' ? 'text-red-700' : 'text-stone-800'}`}>{event.title}</p>
          <p className="text-xs text-stone-500">{event.at ? date(event.at) : 'Time not recorded'}</p>
          {event.detail && <p className="text-xs text-stone-600 mt-1 break-words">{event.detail}</p>}
        </li>)}</ol>
      </>}
  </section>;
}
