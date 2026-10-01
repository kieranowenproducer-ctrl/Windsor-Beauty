'use client';

import { useState } from 'react';

export default function PromotionCodeCopy({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — the code is still visible to copy manually
    }
  }

  return (
    <div className="border border-gold-200 bg-gold-50 px-5 py-4 flex items-center justify-between gap-4">
      <span className="font-serif text-xl sm:text-2xl tracking-[0.2em] text-stone-700">{code}</span>
      <button
        onClick={copyCode}
        className="flex-shrink-0 text-[9px] tracking-[0.18em] uppercase text-gold-700 hover:text-gold-800 border-b border-gold-200 hover:border-gold-400 pb-0.5 transition-colors"
      >
        {copied ? 'Copied' : 'Copy Code'}
      </button>
    </div>
  );
}
