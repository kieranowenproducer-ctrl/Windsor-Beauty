'use client';

import { useAds } from './AdsData';

// What a page shows while the first read is on its way, or when the layout
// above is already explaining why there is nothing to show.

export default function Waiting() {
  const { loading } = useAds();
  if (!loading) return null;
  return (
    <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-8" data-testid="waiting">
      <p className="text-xs text-stone-500">Reading from Meta...</p>
    </div>
  );
}
