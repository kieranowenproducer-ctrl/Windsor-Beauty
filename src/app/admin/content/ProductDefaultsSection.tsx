'use client';

import type { Dispatch, SetStateAction } from 'react';
import MarkdownLiteEditor from '@/components/admin/MarkdownLiteEditor';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  storageDefaults: { enabled: boolean; content: string };
  setStorageDefaults: Dispatch<SetStateAction<{ enabled: boolean; content: string }>>;
  handleSaveStorageDefaults: () => void;
  storageDefaultsSaving: boolean;
  storageDefaultsMessage: string;
}

export default function ProductDefaultsSection({
  storageDefaults, setStorageDefaults, handleSaveStorageDefaults,
  storageDefaultsSaving, storageDefaultsMessage,
}: Props) {
  return (
    <>
            {/* Product Defaults — global content for reusable product info sections */}
            <div id="section-product-defaults" className="bg-white border border-stone-200 p-6">
              <h2 className="text-sm font-semibold text-stone-800 mb-1">Product Defaults</h2>
              <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                Site-wide default content for product page sections. Individual products use this
                content unless they set their own override or hide the section, in the product
                editor under Products.
              </p>

              <div className="space-y-4">
                <div>
                  <span className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-2">
                    Storage Instructions
                  </span>
                  <label className="flex items-center gap-2 text-xs text-stone-500 mb-3">
                    <input
                      type="checkbox"
                      checked={storageDefaults.enabled}
                      onChange={(e) => setStorageDefaults(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="accent-gold-500"
                    />
                    Show the &ldquo;Storage Instructions&rdquo; button on product pages by default
                  </label>
                  <MarkdownLiteEditor
                    value={storageDefaults.content}
                    onChange={(text) => setStorageDefaults(prev => ({ ...prev, content: text }))}
                    height="180px"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveStorageDefaults}
                  disabled={storageDefaultsSaving}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {storageDefaultsSaving ? 'Saving…' : 'Save Product Defaults'}
                </button>
                {storageDefaultsMessage && (
                  <p className="text-xs text-stone-500">{storageDefaultsMessage}</p>
                )}
              </div>
            </div>
    </>
  );
}
