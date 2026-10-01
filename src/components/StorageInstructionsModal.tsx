'use client';

import { useEffect } from 'react';
import { useDialog } from './useDialog';
import { useOverflowLock } from './viewportOwner';
import RichTextContent from './RichTextContent';

interface StorageInstructionsModalProps {
  open: boolean;
  onClose: () => void;
  content: string;
}

// Branded "Storage Instructions" viewer, opened from the button beneath
// "Show Certificate" on a product page. Mirrors the CertificateModal overlay
// pattern (sticky gold control bar, scroll on mobile, escape-to-close) so the
// two popups feel like one system.
export default function StorageInstructionsModal({ open, onClose, content }: StorageInstructionsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Holds the page still while it is open, through the shared counter. It used
  // to set and clear `overflow` itself, which meant closing this released the
  // page underneath anything else that was still open. See viewportOwner.ts.
  useOverflowLock(open, 'storage-modal');

  const dialog = useDialog({ open, labelledBy: 'storage-modal-title' });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div {...dialog} className="relative bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl outline-none">
        {/* Controls */}
        <div className="sticky top-0 bg-white border-b border-gold-100 px-6 py-3 flex items-center justify-between z-10">
          <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700">Storage Instructions</p>
          <button
            onClick={onClose}
            aria-label="Close storage instructions"
            className="text-stone-500 hover:text-stone-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 sm:p-8">
          <h3 id="storage-modal-title" className="font-serif text-xl text-stone-800 font-semibold mb-4">Reconstruction and Storage</h3>
          <RichTextContent html={content} className="text-sm text-stone-600 leading-relaxed" />
        </div>
      </div>
    </div>
  );
}
