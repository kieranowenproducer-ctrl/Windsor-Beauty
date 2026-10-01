'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { compressImageFile } from '@/lib/imageCompression';

interface Props {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  /**
   * Static slug-convention path to preview when no uploaded photo is set yet
   * (e.g. /images/products/{slug}.jpg). Lets staff see at a glance that a
   * product already has a photo from before this uploader existed.
   */
  fallbackSrc?: string;
  /** Shown when there is no photo at all — uploaded or fallback. */
  fallbackHint?: string;
  /** Upload endpoint. Defaults to the product image uploader. */
  endpoint?: string;
  /** Field label and photo-action wording. Defaults to "Product Photo". */
  label?: string;
  /**
   * Reports upload-in-progress to a parent form so it can disable its Save
   * button. Without this, saving while an upload is still in flight commits
   * the old image — the previous value reasserts itself on the next reload,
   * which looks like the new photo "disappeared".
   */
  onUploadingChange?: (uploading: boolean) => void;
}

const MAX_PREVIEW_RETRIES = 4;

export default function ImageUploadField({ value, onChange, fallbackSrc, fallbackHint, endpoint, label, onUploadingChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [fallbackMissing, setFallbackMissing] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const retryCountRef = useRef(0);

  async function handleFile(file: File) {
    setError('');
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const compressed = await compressImageFile(file);
      const form = new FormData();
      form.append('file', compressed);
      const res = await fetch(endpoint ?? '/api/admin/products/upload-image', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Could not upload image.');
      retryCountRef.current = 0;
      setRetryNonce(0);
      onChange(data.url);
      setJustUploaded(true);
      setTimeout(() => setJustUploaded(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  // A freshly uploaded photo can occasionally 404 for an instant while the
  // Blob CDN edge catches up. Retry a few times with a short, increasing
  // delay (and a cache-busting query param, since a failed fetch can itself
  // get cached) rather than leaving a broken-image icon that only resolves
  // on a manual refresh.
  function handleImageError() {
    if (!value) {
      setFallbackMissing(true);
      return;
    }
    if (retryCountRef.current < MAX_PREVIEW_RETRIES) {
      retryCountRef.current += 1;
      setTimeout(() => setRetryNonce(n => n + 1), 500 * retryCountRef.current);
    }
  }

  const showingFallback = !value && Boolean(fallbackSrc) && !fallbackMissing;
  const previewSrc = value || (showingFallback ? fallbackSrc : undefined);
  const previewSrcWithRetry = previewSrc && value && retryNonce > 0
    ? `${previewSrc}${previewSrc.includes('?') ? '&' : '?'}retry=${retryNonce}`
    : previewSrc;
  const fieldLabel = label ?? 'Product Photo';

  return (
    <div>
      <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-2">{fieldLabel}</label>
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 border border-stone-200 bg-stone-50 overflow-hidden shrink-0 flex items-center justify-center">
          {previewSrc ? (
            <Image
              key={value}
              src={previewSrcWithRetry!}
              alt=""
              fill
              className="object-cover"
              sizes="64px"
              unoptimized
              priority
              onError={handleImageError}
            />
          ) : (
            <span className="text-[7px] tracking-wider uppercase text-stone-300 text-center px-1">No photo</span>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
              <svg className="w-5 h-5 text-gold-700 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
          )}
          {justUploaded && !uploading && (
            <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1">
          <label className="inline-block text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors cursor-pointer border border-gold-200 px-4 py-2.5 sm:px-3 sm:py-1.5">
            {uploading ? 'Uploading…' : previewSrc ? 'Replace photo' : 'Upload photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="ml-1 sm:ml-2 p-2.5 sm:p-0 text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          )}
          {showingFallback && (
            <p className="text-[9px] text-stone-500 mt-1.5 leading-relaxed">
              Showing the existing photo at <span className="font-mono">{fallbackSrc}</span>. Uploading a new one here will replace it on the live site.
            </p>
          )}
          {!previewSrc && fallbackHint && (
            <p className="text-[9px] text-stone-300 mt-1.5 leading-relaxed">{fallbackHint}</p>
          )}
          {justUploaded && <p className="text-[9px] text-green-600 mt-1.5">Uploaded.</p>}
          {error && <p className="text-[9px] text-red-500 mt-1.5">{error}</p>}
        </div>
      </div>
    </div>
  );
}
