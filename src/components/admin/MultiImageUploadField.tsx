'use client';

import { useRef, useState } from 'react';
import { compressImageFile } from '@/lib/imageCompression';

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  /** Upload endpoint. Defaults to the product image uploader. */
  endpoint?: string;
  /** Field label. Defaults to "Certificate Pages". */
  label?: string;
  /**
   * Reports upload-in-progress to a parent form so it can disable its Save
   * button. Without this, saving while an upload is still in flight commits
   * the old image list — the previous value reasserts itself on the next
   * reload, which looks like the new photo "disappeared".
   */
  onUploadingChange?: (uploading: boolean) => void;
}

const MAX_PREVIEW_RETRIES = 4;

// Ordered multi-image uploader for external certificates — one or more
// uploaded page images (Page 1, Page 2, ...) that can be reordered, removed,
// or replaced. Mirrors ImageUploadField's upload flow (same endpoint
// contract: POST a "file" field, expect back { url }) but manages an array
// instead of a single value.
export default function MultiImageUploadField({ value, onChange, endpoint, label, onUploadingChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [retryNonces, setRetryNonces] = useState<Record<number, number>>({});
  const retryCounts = useRef<Record<number, number>>({});

  async function uploadFile(file: File): Promise<string> {
    const compressed = await compressImageFile(file);
    const form = new FormData();
    form.append('file', compressed);
    const res = await fetch(endpoint ?? '/api/admin/products/upload-image', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Could not upload image.');
    return data.url as string;
  }

  async function handleAdd(file: File) {
    setError('');
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const url = await uploadFile(file);
      onChange([...value, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  async function handleReplace(index: number, file: File) {
    setError('');
    setUploading(true);
    setReplacingIndex(index);
    onUploadingChange?.(true);
    try {
      const url = await uploadFile(file);
      retryCounts.current[index] = 0;
      onChange(value.map((existing, i) => (i === index ? url : existing)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image.');
    } finally {
      setUploading(false);
      setReplacingIndex(null);
      onUploadingChange?.(false);
    }
  }

  // A freshly uploaded page can occasionally 404 for an instant while the
  // Blob CDN edge catches up — retry a few times rather than leaving a
  // broken-image icon that only resolves on a manual refresh.
  function handleImageError(index: number) {
    const count = retryCounts.current[index] ?? 0;
    if (count < MAX_PREVIEW_RETRIES) {
      retryCounts.current[index] = count + 1;
      setTimeout(() => setRetryNonces(prev => ({ ...prev, [index]: (prev[index] ?? 0) + 1 })), 500 * (count + 1));
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const fieldLabel = label ?? 'Certificate Pages';

  return (
    <div>
      <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-2">{fieldLabel}</label>

      {value.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {value.map((url, i) => {
            const nonce = retryNonces[i] ?? 0;
            const src = nonce > 0 ? `${url}${url.includes('?') ? '&' : '?'}retry=${nonce}` : url;
            return (
            <div key={i} className="flex items-center gap-3 border border-stone-200 p-2">
              <div className="relative w-14 h-14 border border-stone-200 bg-stone-50 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- a just-uploaded blob URL with a cache-busting retry parameter and an onError retry. next/image would cache the very URL this is deliberately re-requesting. */}
                <img key={url} src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" onError={() => handleImageError(i)} />
                {replacingIndex === i && (
                  <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gold-700 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
              <span className="text-[10px] tracking-wider uppercase text-stone-500 shrink-0">Page {i + 1}</span>
              <div className="flex-1 flex items-center gap-1 sm:gap-2 justify-end flex-wrap">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="p-2.5 -m-0.5 sm:p-0 sm:m-0 text-[9px] tracking-wider uppercase text-stone-400 hover:text-gold-700 transition-colors disabled:opacity-30 disabled:hover:text-stone-400"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  className="p-2.5 -m-0.5 sm:p-0 sm:m-0 text-[9px] tracking-wider uppercase text-stone-400 hover:text-gold-700 transition-colors disabled:opacity-30 disabled:hover:text-stone-400"
                >
                  Down
                </button>
                <label className="text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors cursor-pointer border border-gold-200 px-3 py-2 sm:px-2 sm:py-1">
                  Replace
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleReplace(i, file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="p-2.5 -m-0.5 sm:p-0 sm:m-0 text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <label className="inline-block text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors cursor-pointer border border-gold-200 px-4 py-2.5 sm:px-3 sm:py-1.5">
        {uploading && replacingIndex === null ? 'Uploading…' : '+ Add Page'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleAdd(file);
            e.target.value = '';
          }}
        />
      </label>
      {error && <p className="text-[9px] text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
