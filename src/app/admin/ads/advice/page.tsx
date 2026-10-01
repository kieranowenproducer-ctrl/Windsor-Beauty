'use client';

import Link from 'next/link';
import { AdviserPanels } from '@/components/admin/ads/AdviserPanels';

// Advice: what the numbers say, and what to try next. The tag line to paste
// into Ads Manager lives with the New ad steps on the Compare page, so it is
// explained once (audit item 12).

export default function AdvicePage() {
  return (
    <div data-testid="page-advice">
      <AdviserPanels />
      <p className="text-[11px] text-stone-500 mb-8" data-testid="advice-footnote">
        Making a new ad, and the line to paste into its URL parameters box, are on the{' '}
        <Link href="/admin/ads/compare" className="text-gold-700 hover:underline">Compare</Link> page.
        Purchase figures from Meta only appear once the website&apos;s Meta tracking is switched on; the orders
        here come from our own records and work today.
      </p>
    </div>
  );
}
