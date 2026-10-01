'use client';

import { useState } from 'react';
import type { ContactSubject } from '@/lib/contactContent';

type FormState = {
  name: string;
  email: string;
  subject: string;
  orderNumber: string;
  message: string;
};

// These values trigger the optional/required order number field below the
// subject dropdown, regardless of what label an admin has given the option.
const ORDER_SUBJECTS = new Set(['order', 'returns', 'verify']);
const ORDER_NUMBER_REQUIRED = new Set(['order', 'returns']);

export default function ContactForm({ subjects }: { subjects: ContactSubject[] }) {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    subject: '',
    orderNumber: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/contact/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.status !== 'sent') {
        setError(data?.message || 'We could not send your message just now. Please try again shortly or email us directly.');
        return;
      }
      setSubmitted(true);
    } catch {
      setError('We could not send your message just now. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  const needsOrderNumber = ORDER_SUBJECTS.has(form.subject);
  const orderNumberRequired = ORDER_NUMBER_REQUIRED.has(form.subject);

  const inputClass =
    'w-full border border-stone-200 focus:border-gold-400 outline-none px-4 py-3 text-sm text-stone-700 bg-white';

  if (submitted) {
    return (
      <div className="border border-gold-200 bg-gold-50/30 p-10 text-center">
        <div className="w-12 h-12 rounded-full bg-gold-700 flex items-center justify-center mx-auto mb-5">
          <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 10l4 4 8-8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="font-serif text-xl text-stone-700 mb-2">Message Sent</p>
        <p className="text-xs text-stone-500 leading-relaxed mb-6">
          Thank you for getting in touch. Our team will get back to you as soon as possible.
        </p>
        <button
          onClick={() => {
            setSubmitted(false);
            setForm({ name: '', email: '', subject: '', orderNumber: '', message: '' });
          }}
          className="text-[9px] tracking-[0.18em] uppercase text-gold-700 hover:text-gold-800 transition-colors"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
            Full Name
          </label>
          <input
            id="contact-name"
            type="text"
            value={form.name}
            onChange={update('name')}
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
            Email Address
          </label>
          <input
            id="contact-email"
            type="email"
            value={form.email}
            onChange={update('email')}
            required
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-subject" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
          Subject
        </label>
        <select
          id="contact-subject"
          value={form.subject}
          onChange={update('subject')}
          required
          className={inputClass + ' cursor-pointer'}
        >
          <option value="" disabled>Select a subject</option>
          {subjects.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {needsOrderNumber && (
        <div>
          <label htmlFor="contact-orderNumber" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
            Order Number {orderNumberRequired ? '' : <span className="normal-case tracking-normal text-stone-500">(optional)</span>}
          </label>
          <input
            id="contact-orderNumber"
            type="text"
            value={form.orderNumber}
            onChange={update('orderNumber')}
            required={orderNumberRequired}
            placeholder="e.g. WG-XGRXZ9"
            className={inputClass + ' tracking-widest uppercase placeholder-stone-500'}
          />
          <p className="text-[9px] text-stone-500 mt-1.5 leading-relaxed">
            Your order number is included in your confirmation email and on your account page.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="contact-message" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
          Message
        </label>
        <textarea
          id="contact-message"
          value={form.message}
          onChange={update('message')}
          required
          rows={6}
          className={inputClass + ' resize-none'}
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 leading-relaxed">{error}</p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-4 hover:bg-gold-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {sending ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  );
}
