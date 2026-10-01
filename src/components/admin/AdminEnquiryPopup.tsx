'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export interface EnquiryPopupItem {
  id: number;
  name: string;
  subject_label: string;
  priority: 'normal' | 'high' | 'urgent';
  order_number: string | null;
}

export interface EnquiryPopupSnapshot {
  newCount: number;
  latestUpdatedAt: string;
  recent: EnquiryPopupItem[];
}

export default function AdminEnquiryPopup({ alert, onAcknowledge }: {
  alert: EnquiryPopupSnapshot;
  onAcknowledge: () => void;
}) {
  const openRef = useRef<HTMLAnchorElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openRef.current?.focus();
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === openRef.current) {
        event.preventDefault();
        closeRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === closeRef.current) {
        event.preventDefault();
        openRef.current?.focus();
      }
    };
    document.addEventListener('keydown', keepFocus);
    return () => document.removeEventListener('keydown', keepFocus);
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/70 px-4 py-6" role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="enquiry-popup-title"
        aria-describedby="enquiry-popup-detail"
        className="relative w-full max-w-md border border-gold-600 bg-white p-6 shadow-2xl sm:p-8">
        <button ref={closeRef} type="button" onClick={onAcknowledge}
          aria-label="Close enquiry notification"
          title="I have seen this notification"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center text-xl text-stone-700 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-inset">
          <span aria-hidden="true">×</span>
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">Customer support</p>
        <h2 id="enquiry-popup-title" className="mt-2 font-serif text-2xl text-stone-900">
          {alert.newCount === 1 ? 'An enquiry needs a reply' : `${alert.newCount} enquiries need replies`}
        </h2>
        <p id="enquiry-popup-detail" className="mt-2 text-sm leading-6 text-stone-700">
          A customer message is waiting in Website Enquiries. Please check it promptly.
        </p>
        <div className="mt-5 border-y border-stone-200 py-3">
          {alert.recent.map(item => (
            <div key={item.id} className="py-2 text-sm text-stone-800">
              <span className="font-semibold">{item.name}</span>
              {item.priority === 'urgent' && <span className="ml-2 font-semibold text-red-700">Urgent</span>}
              <span className="block text-stone-600">{item.subject_label}</span>
              {item.order_number && <span className="block text-xs text-stone-500">Order {item.order_number}</span>}
            </div>
          ))}
        </div>
        <div className="mt-6">
          <Link ref={openRef} href="/admin/enquiries" onClick={onAcknowledge}
            className="inline-flex min-h-11 items-center bg-gold-700 px-5 py-2 text-sm font-semibold text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-700 focus-visible:ring-offset-2">
            Open enquiries
          </Link>
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-600">Closing this note confirms you saw it. The enquiry stays waiting until someone handles it.</p>
      </div>
    </div>
  );
}
