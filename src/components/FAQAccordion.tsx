'use client';

import { useState } from 'react';

export interface FAQItem {
  question: string;
  answer: string;
}

export default function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="border-t border-gold-100">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.question} className="border-b border-gold-100">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 py-5 text-left group"
            >
              <span className={`text-sm font-medium transition-colors ${isOpen ? 'text-gold-700' : 'text-stone-700 group-hover:text-gold-800'}`}>
                {item.question}
              </span>
              <svg
                className={`w-4 h-4 shrink-0 text-gold-700 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            {isOpen && (
              <p className="text-sm text-stone-500 leading-relaxed pb-6 pr-10">
                {item.answer}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
