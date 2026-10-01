'use client';

// Campaign landing poster — the full-screen offer a QR scanner sees once per
// visit, wherever they land. Extracted from EntryGate (2026-07-10) because the
// QR flow's destination (/account/register) is gate-EXEMPT, so a poster living
// inside EntryGate could never appear there. This component mounts on every
// public page via SiteChrome and is driven purely by the non-httpOnly
// `wb_qr_campaign` session cookie set by /r/[slug]:
//   fresh scan -> cookie set -> poster shows ONCE (per browser session) ->
//   gold "Continue to Site" button -> the page they were sent to.
// Unlike the old EntryGate version, it shows for logged-in members too — a gym
// member who scans the poster QR should always see the offer once.

import { useEffect, useState } from 'react';
import { CAMPAIGN_POSTERS } from '@/lib/campaignPosters';

const posterSeenKey = (slug: string) => `wb_poster_seen_${slug}`;

export default function CampaignPoster() {
  const [poster, setPoster] = useState<{ slug: string; src: string } | null>(null);

  useEffect(() => {
    const cookieSlug = document.cookie
      .split('; ')
      .find(row => row.startsWith('wb_qr_campaign='))
      ?.split('=')[1];
    if (cookieSlug && CAMPAIGN_POSTERS[cookieSlug] && sessionStorage.getItem(posterSeenKey(cookieSlug)) !== 'true') {
      setPoster({ slug: cookieSlug, src: CAMPAIGN_POSTERS[cookieSlug] });
    }
  }, []);

  if (!poster) return null;

  const dismiss = () => {
    sessionStorage.setItem(posterSeenKey(poster.slug), 'true');
    setPoster(null);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
      {/* min-h-full so justify-center works on desktop; justify-start keeps poster
          at the top on mobile so no dark strip appears above it */}
      <div
        className="min-h-full flex flex-col items-center justify-start sm:justify-center py-3 sm:py-8 px-3 sm:px-6"
        onClick={dismiss}
      >
        <div className="relative w-full max-w-sm sm:max-w-md" onClick={e => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an admin-uploaded poster from blob storage, with no known dimensions at build time. next/image needs a width and height or a configured loader, and neither is true of an image the shop owner uploads. */}
          <img
            src={poster.src}
            alt="Exclusive Windsor Beauty partner offer"
            className="w-full block"
            draggable={false}
          />
          {/* Real button — works regardless of what the poster image looks like */}
          <button
            type="button"
            onClick={dismiss}
            className="w-full bg-[#c9a84c] hover:bg-[#b8973d] text-white text-[11px] tracking-[0.25em] uppercase font-semibold py-4 transition-colors"
          >
            Continue to Site
          </button>
        </div>
      </div>
    </div>
  );
}
