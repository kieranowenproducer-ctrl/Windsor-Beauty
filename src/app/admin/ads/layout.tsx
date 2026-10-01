'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdsNav from '@/components/admin/ads/AdsNav';
import { AdsProvider, RANGE_LABELS, adsManagerUrl, useAds, type RangePreset } from '@/components/admin/ads/AdsData';
import { formatTime } from '@/components/admin/ads/shared';

// The frame around every Ad Results page: the admin sidebar, the title, the
// period dropdown, the refresh and download buttons, any warning that must be
// seen before anything else, and the navigation bar. The figures are read
// once (see AdsData) and shared by whichever page is open.

const CARD = 'bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)]';

function AdsShell({ children }: { children: ReactNode }) {
  const {
    range, setRange, data, loading, refreshedAt, refreshError, refreshWaitMinutes, refreshNow,
    accountId, issues, neverRan, openInAdsManager,
    ready, ads, allAds,
  } = useAds();

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <a
        href="#ad-results-content"
        className="sr-only focus:not-sr-only fixed left-3 top-3 z-[70] rounded-lg bg-white px-4 py-3 text-sm font-semibold text-gold-800 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      >
        Skip to ad results
      </a>
      <AdminSidebar />

      <main id="ad-results-content" tabIndex={-1} className="flex-1 overflow-clip p-4 sm:p-8 lg:p-10" data-testid="ads-shell" data-loading={loading}>
        <div className="max-w-6xl">

          <Link
            href="/admin/dashboard"
            title="Back to the Windsor Glow main admin dashboard"
            data-testid="back-to-main"
            className="mb-4 inline-flex min-h-11 touch-manipulation items-center py-2 text-[10px] tracking-[0.18em] uppercase text-stone-500 transition-colors hover:text-gold-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
          >
            &larr; Main dashboard
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <h1 className="text-xl font-semibold text-stone-800 mb-0.5">Ad Results</h1>
              <p className="text-xs text-stone-500">Windsor Glow, Facebook and Instagram ads, read straight from Meta</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="refresh-bar" aria-live="polite">
                <span className="text-[11px] text-stone-500">
                  {refreshedAt ? `Read from Meta at ${formatTime(refreshedAt)}.` : 'Reading from Meta…'}
                  {' '}Meta&apos;s own figures lag about 15 minutes, so a refresh sooner than that shows the same numbers.
                </span>
                <button
                  type="button"
                  onClick={refreshNow}
                  disabled={loading || refreshWaitMinutes > 0}
                  data-testid="refresh-button"
                  className="min-h-11 touch-manipulation rounded-lg border border-stone-200 px-4 py-2.5 text-[10px] tracking-[0.18em] uppercase text-stone-600 transition-colors hover:border-gold-300 hover:text-gold-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:hover:border-stone-200 disabled:hover:text-stone-600"
                >
                  {loading ? 'Reading…' : refreshWaitMinutes > 0 ? `Refresh again in ${refreshWaitMinutes} min` : 'Refresh'}
                </button>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 items-stretch gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
              <label className="col-span-2 flex min-h-11 items-center justify-between gap-2 text-[10px] tracking-[0.18em] uppercase text-stone-600 sm:col-span-1 sm:justify-start">
                <span>Period</span>
                <select
                  aria-label="Period"
                  value={range}
                  onChange={(e) => setRange(e.target.value as RangePreset)}
                  className="min-h-11 flex-1 touch-manipulation rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] tracking-[0.12em] uppercase text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 sm:flex-none"
                >
                  {(Object.keys(RANGE_LABELS) as RangePreset[]).map((p) => (
                    <option key={p} value={p}>{RANGE_LABELS[p]}</option>
                  ))}
                </select>
              </label>
              {accountId && (
                <>
                  <a
                    href={`/api/admin/ads/export?range=${range}`}
                    download
                    data-testid="download-csv"
                    title="A spreadsheet of this period: day by day, campaigns and ads, with the names you gave them"
                    className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-gold-500 px-3 py-2.5 text-center text-[10px] tracking-[0.16em] uppercase text-gold-700 transition-colors hover:bg-gold-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 sm:px-4 sm:tracking-[0.18em]"
                  >
                    Spreadsheet
                  </a>
                  <a
                    href={adsManagerUrl(accountId)}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-gold-500 bg-gold-700 px-3 py-2.5 text-center text-[10px] tracking-[0.16em] uppercase text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 sm:px-4 sm:tracking-[0.18em]"
                  >
                    Ads Manager &#8599;
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Warnings that must be seen whatever page is open. */}
          {data && !data.configured && (
            <div className={`${CARD} p-5 sm:p-6 mb-8`}>
              <div className="text-[10px] tracking-[0.18em] uppercase text-stone-500 mb-2">Not connected</div>
              <p className="text-xs text-stone-600">
                The Meta connection details are not set for this site yet, so there is nothing to read.
                {data.detail ? ` (${data.detail})` : ''}
              </p>
            </div>
          )}

          {(refreshError ?? data?.error) && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-8" data-testid="meta-error" role="alert">
              <div className="text-[10px] tracking-[0.18em] uppercase text-red-600 mb-2">Meta could not be read</div>
              <p className="text-xs text-red-700">{refreshError ?? data?.error}</p>
              {refreshError && data && data.configured && !data.error && refreshedAt && (
                <p className="text-[11px] text-red-600 mt-1" data-testid="kept-figures">
                  The figures below are the ones read at {formatTime(refreshedAt)}. Nothing has been made up to fill the gap.
                </p>
              )}
              <p className="text-[11px] text-red-400 mt-2">
                Whatever this says, your money and your figures inside Ads Manager are unaffected.
                This page only reads them.
              </p>
            </div>
          )}

          {issues.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-8">
              <div className="text-[10px] tracking-[0.18em] uppercase text-red-600 mb-2">
                {issues.length === 1 ? 'An ad needs attention' : `${issues.length} ads need attention`}
              </div>
              {issues.map((i) => (
                <button
                  type="button"
                  key={i.adId}
                  onClick={() => openInAdsManager('ads', i.adId)}
                  className="mb-1 block min-h-11 touch-manipulation text-left text-xs text-red-700 transition-colors hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                >
                  {i.effectiveStatus === 'DISAPPROVED' ? 'Rejected by Meta: ' : 'Flagged by Meta: '}
                  <span className="font-semibold">{i.adName}</span>
                  <span aria-hidden className="ml-1 text-red-300">&#8599;</span>
                </button>
              ))}
            </div>
          )}

          {neverRan && (
            <div className="bg-gold-50 border border-gold-200 rounded-2xl p-5 mb-8">
              <div className="text-[10px] tracking-[0.18em] uppercase text-gold-700 mb-2">Waiting for the first campaign</div>
              <p className="text-xs text-stone-600 mb-3">
                This ad account has never run an ad. When the next campaign is run from it,
                every figure on these pages fills in on its own, the daily snapshot starts
                learning, and the Monday email starts saying something.
              </p>
              <button
                type="button"
                onClick={() => openInAdsManager('campaigns')}
                className="min-h-11 touch-manipulation rounded-lg border border-gold-500 px-4 py-2 text-[10px] tracking-[0.18em] uppercase text-gold-700 transition-colors hover:bg-gold-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
              >
                Start one in Meta Ads Manager &#8599;
              </button>
            </div>
          )}

          <AdsNav />

          {ready && allAds.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-[11px] text-stone-700" data-testid="current-ad-scope">
              <span className="font-semibold">{ads.length > 0 ? `Showing ${ads.length} current live ${ads.length === 1 ? 'ad' : 'ads'}` : 'No advert is live right now'}</span>
              <Link href="/admin/ads/all" className="min-h-11 content-center font-semibold text-gold-800 underline decoration-gold-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">Manage past and hidden ads</Link>
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}

export default function AdsLayout({ children }: { children: ReactNode }) {
  return (
    <AdsProvider>
      <AdsShell>{children}</AdsShell>
    </AdsProvider>
  );
}
