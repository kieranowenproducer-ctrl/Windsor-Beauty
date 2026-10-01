'use client';

import { useEffect } from 'react';
import { useDialog } from './useDialog';
import { useViewportOwner } from './viewportOwner';
import DosageCalculator from './DosageCalculator';

interface CalculatorModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CalculatorModal({ open, onClose }: CalculatorModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Owns the screen and locks the page behind it through the shared counter.
  // It used to put the scroll position back itself, which ANIMATED it, because
  // globals.css sets `html { scroll-behavior: smooth }`. See viewportOwner.ts.
  useViewportOwner(open, 'calculator-modal', { lockScroll: true });

  const dialog = useDialog({ open, labelledBy: 'calculator-modal-title' });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div {...dialog} className="relative bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl outline-none">
        <div className="sticky top-0 bg-white border-b border-gold-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-0.5">Tools</p>
            <h2 id="calculator-modal-title" className="font-serif text-xl text-stone-800 tracking-wide">Dosage Calculator</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close calculator"
            className="text-stone-500 hover:text-stone-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="border border-gold-200 bg-gold-50 px-4 py-3 mb-6 text-center">
            <p className="text-[9px] text-gold-700 leading-relaxed">
              For research reference only. This tool does not provide medical advice and our products are not intended
              to diagnose, treat, cure, or prevent disease. Your basket and checkout progress are saved automatically —
              closing this window will not affect your order.
            </p>
          </div>
          <DosageCalculator compact />
        </div>
      </div>
    </div>
  );
}
