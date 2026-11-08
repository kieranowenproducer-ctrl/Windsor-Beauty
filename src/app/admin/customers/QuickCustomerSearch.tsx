'use client';

import { useState } from 'react';
import Link from 'next/link';
import { customerDisplayName, type Customer } from './customerTypes';

// A search box beside Find Customers (Samuel, 3 Oct 2026). The full list and its own
// search sit below several panels, a long scroll on a phone. This answers "where is
// this person" from the top of the page: type, then tap the name to open them.

const SHOWN = 8;

export default function QuickCustomerSearch({ customers }: { customers: Customer[] }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  // Every word has to be somewhere on the customer, so "amber reta" and "reta amber" agree.
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length === 0 ? [] : customers.filter(c => {
    const haystack = [customerDisplayName(c), c.email, c.phone ?? '', c.referredBy ?? '']
      .join(' ').toLowerCase();
    return words.every(w => haystack.includes(w));
  });

  return (
    <div className="relative w-full sm:w-72" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <input
        type="search"
        enterKeyHint="search"
        value={text}
        onChange={e => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
        placeholder="Search customers by name or email"
        aria-label="Search customers"
        className="w-full border border-gold-300 focus:border-gold-500 outline-none bg-white px-3 py-2.5 text-base sm:text-sm text-stone-700 transition-colors"
      />
      {open && words.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 border border-stone-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-stone-500">No customer matches that.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {matches.slice(0, SHOWN).map(c => (
                <li key={c.id}>
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="block px-3 py-2.5 hover:bg-gold-50 transition-colors"
                  >
                    <span className="block text-sm text-stone-800">{customerDisplayName(c)}</span>
                    <span className="block text-[11px] text-stone-500 break-all">{c.email}</span>
                  </Link>
                </li>
              ))}
              {matches.length > SHOWN && (
                <li className="px-3 py-2 text-[11px] text-stone-500">
                  {matches.length - SHOWN} more. Keep typing to narrow it down.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
