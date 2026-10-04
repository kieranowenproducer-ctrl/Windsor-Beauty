'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import MemberRegistrationForm, { type MemberFormData } from '@/components/MemberRegistrationForm';
import { getVisitId } from '@/lib/analytics/shopTracking';
import { useViewportOwner } from '@/components/viewportOwner';

type SignupStatus = 'idle' | 'success';
type UnlockStatus = 'idle' | 'submitting' | 'error';

const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2z" />
    </svg>
  );
}

// Launch countdown + launch announcement (task 4c8541df, wording per Kieran's
// revision). The copy, timer, and the spelled-out go-live moment all render
// together once the target is known; everything hides once the moment passes
// (the wall itself comes down separately at launch). The date/time line is
// derived from the configured target, so changing it on the dashboard updates
// the wording here automatically.
function LaunchCountdown() {
  const [launchAt, setLaunchAt] = useState<number | null>(null);
  // Difference between the server's clock and this device's clock, measured on
  // the countdown fetch. Every comparison below is done in SERVER time, because
  // the server's clock is what actually opens the wall. A visitor whose laptop
  // is ten minutes slow used to watch the timer run past zero while the site
  // was already live.
  const [skewMs, setSkewMs] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/launch/countdown', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (typeof data.serverNow === 'string') {
          const s = new Date(data.serverNow).getTime();
          if (Number.isFinite(s)) setSkewMs(s - Date.now());
        }
        if (typeof data.launchAt === 'string') {
          const t = new Date(data.launchAt).getTime();
          if (Number.isFinite(t)) setLaunchAt(t);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (launchAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [launchAt]);

  // Once the countdown reaches zero, take everyone who is sitting on this page
  // through to the live site. The countdown previously just vanished at zero
  // and left the visitor on the coming-soon page indefinitely.
  //
  // The page never decides for itself that the site is open: it asks the
  // server, and only navigates when the server confirms `open`. That matters
  // because middleware sends walled traffic straight back here — navigating on
  // the strength of a fast device clock alone would bounce the visitor
  // /coming-soon -> / -> /coming-soon in a loop. Polling until the server
  // agrees is both loop-proof and self-healing if the launch instant moves.
  const serverNow = now + skewMs;
  const reachedZero = launchAt !== null && serverNow >= launchAt;

  useEffect(() => {
    if (!reachedZero) return;
    let stopped = false;
    const goLiveIfOpen = async () => {
      try {
        const res = await fetch('/api/launch/countdown', { cache: 'no-store' });
        const data = await res.json();
        if (!stopped && data?.open === true) window.location.replace('/');
      } catch {
        // Offline or a blip: leave the visitor where they are and try again.
      }
    };
    void goLiveIfOpen();
    const poll = setInterval(goLiveIfOpen, 5000);
    return () => { stopped = true; clearInterval(poll); };
  }, [reachedZero]);

  if (launchAt === null) return null;
  const remaining = launchAt - serverNow;
  if (remaining <= 0) {
    return (
      <div className="mb-10" role="status" aria-live="polite">
        <p className="font-serif text-2xl text-stone-800 tracking-wide mb-3">
          Welcome to <span className="text-gold-700">Windsor Beauty</span>
        </p>
        <p className="text-sm text-stone-500">
          We are live. Taking you to the shop now.
        </p>
        <noscript>
          <p className="text-sm text-stone-500 mt-3">
            {/* A plain <a>, not a <Link>, and deliberately so: this sits inside
                <noscript>, which is only ever seen when JavaScript is unavailable.
                A <Link> needs JavaScript to navigate, so it would be a dead link
                for exactly the visitor this fallback exists for. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- this sits inside <noscript>, which is only seen when JavaScript is off, and next/link needs JavaScript to navigate. A Link here would be a dead link for exactly the visitor this fallback exists for. */}
            <a href="/" className="text-gold-700 underline">Enter the site</a>
          </p>
        </noscript>
      </div>
    );
  }

  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const tiles: Array<[string, number]> = [
    ['Days', days], ['Hours', hours], ['Minutes', minutes], ['Seconds', seconds],
  ];

  const launchDate = new Date(launchAt);
  const dateLine = launchDate.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
  });
  const timeLine = launchDate.toLocaleTimeString('en-GB', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Europe/London',
  }).replace(' ', '');

  return (
    <div className="mb-10">
      {/* Launch announcement */}
      <div className="max-w-md mx-auto mb-8">
        <p className="text-sm text-stone-500 leading-relaxed mb-4">
          We are proud to open <span className="font-semibold text-stone-700">windsorbeauty.is</span>.
        </p>
        <p className="text-sm text-stone-500 leading-relaxed mb-5">
          Thank you to everyone who signed up early. We look forward to welcoming you.
        </p>
        <p className="font-serif text-2xl text-stone-800 tracking-wide">
          Welcome to <span className="text-gold-700">Windsor Beauty</span>
        </p>
      </div>

      {/* The timer */}
      <div className="flex justify-center gap-3 sm:gap-4 mb-5" aria-label="Time until launch">
        {tiles.map(([label, value]) => (
          <div key={label} className="w-16 sm:w-[4.5rem] border border-gold-200 bg-white py-3 text-center shadow-sm">
            <p className="font-serif text-2xl sm:text-3xl text-gold-700 leading-none tabular-nums">
              {String(value).padStart(2, '0')}
            </p>
            <p className="text-[8px] tracking-[0.25em] uppercase text-stone-500 mt-1.5">{label}</p>
          </div>
        ))}
      </div>

      {/* The go-live moment, spelled out */}
      <p className="text-[10px] tracking-[0.3em] uppercase text-gold-700 font-semibold">
        We go live at {timeLine} UK time
      </p>
      <p className="text-[10px] tracking-[0.3em] uppercase text-stone-500 mt-1">
        {dateLine}
      </p>
    </div>
  );
}

// Simple stroke-style icons matching the line-art language already used in
// Header.tsx (1.5 stroke, currentColor, 24x24 viewBox) — not decorative
// filler, each one labels a real membership benefit below it.
function GiftIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path strokeLinecap="round" d="M4 13h16M12 9v11" />
      <path strokeLinecap="round" d="M12 9C9.5 9 8 7.5 8 6a2 2 0 0 1 4 0M12 9c2.5 0 4-1.5 4-3a2 2 0 0 0-4 0" />
    </svg>
  );
}
function EnvelopeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5l8 6.5 8-6.5" />
    </svg>
  );
}
function CrownIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 17h16l1-9-5 3.5L12 6 8 11.5 3 8l1 9z" />
      <path strokeLinecap="round" d="M5 20h14" />
    </svg>
  );
}

const MEMBER_BENEFITS = [
  { icon: GiftIcon, label: 'Your exclusive 10% welcome gift' },
  { icon: EnvelopeIcon, label: 'Early access to new arrivals' },
  { icon: CrownIcon, label: 'Members-only offers and discounts' },
];

export default function ComingSoonPage() {
  const router = useRouter();

  const [signupStatus, setSignupStatus] = useState<SignupStatus>('idle');

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const [showAccessForm, setShowAccessForm] = useState(false);
  const [code, setCode] = useState('');
  const [unlockStatus, setUnlockStatus] = useState<UnlockStatus>('idle');
  const [unlockError, setUnlockError] = useState('');

  // The registration modal owns the screen while it is open, and the page behind
  // it is locked (position:fixed avoids iOS scroll bleed).
  //
  // This used to restore the scroll position itself with a plain window.scrollTo,
  // which ANIMATES, because globals.css sets `html { scroll-behavior: smooth }`.
  // Closing the modal from part-way down therefore made the whole page scroll
  // itself back up over about a second. The same fault was measured on the live
  // shop's basket drawer on 15 August 2026 (1000 -> still travelling through 424
  // a moment after closing). The shared counter in viewportOwner.ts puts the page
  // back instantly and only once the last layer has gone.
  //
  // This page is the dormant pre-launch wall, so nobody is hitting it today. It
  // is fixed anyway: the day LAUNCH_ACCESS_CODE goes back on is not the day to
  // discover it.
  useViewportOwner(modalOpen, 'coming-soon-signup', { lockScroll: true });

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attach the Escape-key handler only as the modal opens and closes. Including closeModal or submitting would tear down and re-register the listener on each keystroke.
  }, [modalOpen]);

  function openModal() {
    setServerError('');
    setModalOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setServerError('');
    setModalOpen(false);
  }

  async function handleRegister(data: MemberFormData) {
    setServerError('');
    setSubmitting(true);
    try {
      const res = await fetchWithTimeout('/api/launch/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, visit_id: getVisitId() }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json) {
        setServerError(json?.message || 'Something went wrong. Please try again shortly.');
        return;
      }

      if (json.status === 'created') {
        setModalOpen(false);
        setSignupStatus('success');
      } else {
        // 'existing' (already active account) or any other non-created status
        // is surfaced as an in-modal error so the user sees it clearly.
        setServerError(json.message || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      setServerError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'That took too long to respond. Please check your connection and try again.'
          : 'Something went wrong. Please check your connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (unlockStatus === 'submitting') return;

    setUnlockStatus('submitting');
    setUnlockError('');

    try {
      const res = await fetchWithTimeout('/api/launch/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => null);
      setUnlockStatus('error');
      setUnlockError(data?.error || 'Incorrect code.');
    } catch (err) {
      setUnlockStatus('error');
      setUnlockError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'That took too long to respond. Please try again.'
          : 'Something went wrong. Please try again.'
      );
    }
  }

  const unlockSubmitting = unlockStatus === 'submitting';
  const unlockDisabled = unlockSubmitting || code.length !== 8;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md mx-auto text-center">

        <div className="flex justify-center mb-6">
          <Image
            src="/images/logo-transparent.png"
            alt="Windsor Beauty"
            width={320}
            height={200}
            className="w-48 h-auto object-contain"
            priority
          />
        </div>

        {/* Script accent headline — the one deliberate decorative-font use on
            this page, reserved for this single word. Subtle glow draws the
            eye without being distracting; disabled under reduced motion. */}
        <p
          className="font-script text-7xl sm:text-8xl text-gold-700 leading-[0.85] mb-4 motion-reduce:animate-none animate-glow"
          style={{ paddingBottom: '0.15em' }}
        >
          Coming Soon
        </p>

        <LaunchCountdown />

        <p className="text-sm text-stone-500 leading-relaxed max-w-sm mx-auto mb-10">
          Be the first to be part of something <span className="font-semibold text-stone-700">extraordinary</span>,
          and enjoy your <span className="font-semibold text-stone-700">exclusive</span> welcome gift.
        </p>

        {/* CTA / success box */}
        <div className="border-2 border-gold-400 bg-white px-6 py-10 sm:px-8 text-center shadow-sm">
          {signupStatus === 'success' ? (
            <>
              <p className="text-[10px] tracking-[0.38em] uppercase text-gold-700 font-semibold mb-3">
                One Last Step
              </p>
              <h2 className="font-serif text-3xl text-stone-800 tracking-wide mb-2">
                Your verification email has been sent
              </h2>
              <div className="w-14 h-0.5 bg-gold-700 mx-auto mb-6" aria-hidden="true" />

              {/* The four things a new member must know, stated plainly —
                  nobody should ever wonder what happens after registering. */}
              <div className="text-left max-w-sm mx-auto space-y-4 mb-8">
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gold-700 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    <span className="font-semibold text-stone-800">Check your inbox now</span>, and
                    your spam or junk folder if you cannot see it.
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gold-700 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    <span className="font-semibold text-stone-800">Click the verification link.</span>{' '}
                    It expires in <span className="font-semibold text-stone-800">48 hours</span>.
                  </p>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-gold-700 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    <span className="font-semibold text-stone-800">Your 10% code arrives by email</span>{' '}
                    the moment you verify, and your member account is active.
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-stone-500 leading-relaxed border-t border-gold-100 pt-4">
                You must verify your email before you can continue. Nothing in your inbox after a
                few minutes? Check spam first, then email{' '}
                <a href="mailto:sales@windsorbeauty.is" className="text-gold-700 underline">sales@windsorbeauty.is</a>{' '}
                and we will help.
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] tracking-[0.38em] uppercase text-gold-700 font-semibold mb-3">
                You&rsquo;re Invited To Something Special
              </p>
              <h2 className="font-serif text-2xl text-stone-800 tracking-wide leading-snug mb-6">
                Register for Free and Become a Windsor Beauty Member
              </h2>

              {/* 10% off — the primary focal point on this page */}
              <p className="text-[11px] text-stone-500 leading-relaxed mb-1">
                As a member, you&rsquo;ll receive your special, bespoke
              </p>
              <p className="font-serif text-6xl text-gold-700 font-semibold leading-none mb-2 motion-reduce:animate-none animate-flashGold">
                10% OFF
              </p>
              <p className="text-[11px] text-stone-500 leading-relaxed mb-8">
                your first order, the moment we launch.
              </p>

              {/* Benefit icon row */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {MEMBER_BENEFITS.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-gold-50 text-gold-700 flex items-center justify-center mb-2">
                      <Icon />
                    </div>
                    <p className="text-[9px] text-stone-500 leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-stone-500 italic leading-relaxed mb-6">
                Be first in line. Be part of something special.
              </p>

              <button
                onClick={openModal}
                className="w-full bg-gold-700 text-white text-[11px] font-semibold tracking-[0.2em] uppercase py-4 hover:bg-gold-800 transition-colors"
              >
                Become a Windsor Beauty Member
              </button>
              <p className="text-[10px] text-stone-500 leading-relaxed mt-5">
                Verify your email after signing up to unlock your discount code.
              </p>
            </>
          )}
        </div>

        {/* Access-code section */}
        <div className="mt-10">
          {!showAccessForm ? (
            <button
              onClick={() => setShowAccessForm(true)}
              className="text-[11px] font-medium tracking-[0.18em] uppercase text-stone-600 hover:text-gold-800 border-b border-stone-300 hover:border-gold-400 pb-0.5 transition-colors"
            >
              Have an access code?
            </button>
          ) : (
            <form onSubmit={handleUnlock} className="max-w-xs mx-auto space-y-2.5">
              <label
                htmlFor="access-code"
                className="block text-[11px] font-medium tracking-[0.15em] uppercase text-stone-600 mb-1.5"
              >
                8-Digit Access Code
              </label>
              <input
                id="access-code"
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={code}
                disabled={unlockSubmitting}
                onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="00000000"
                className="w-full border-2 border-stone-300 focus:border-gold-500 outline-none px-3 py-2.5 text-sm text-stone-800 text-center tracking-[0.2em] placeholder-stone-500 bg-white disabled:bg-stone-50 disabled:text-stone-400 transition-colors"
              />
              {unlockStatus === 'error' && (
                <p className="text-[12px] text-red-600 font-medium leading-relaxed">{unlockError}</p>
              )}
              <button
                type="submit"
                disabled={unlockDisabled}
                className={`w-full text-[11px] font-semibold tracking-[0.18em] uppercase py-2.5 border-2 transition-colors ${
                  unlockSubmitting
                    ? 'border-gold-500 text-gold-700 cursor-wait'
                    : code.length !== 8
                    ? 'border-stone-300 text-stone-500 cursor-not-allowed'
                    : 'border-stone-500 text-stone-700 hover:border-gold-500 hover:text-gold-800 cursor-pointer'
                }`}
              >
                {unlockSubmitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner /> Checking&hellip;
                  </span>
                ) : (
                  'Unlock Site'
                )}
              </button>
            </form>
          )}
        </div>

      </div>

      {/* Registration modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[300] overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />

          {/* Dialog shell — absolutely positioned so it has a definite pixel
              height at all times, which makes overflow-y-auto reliable on iOS.
              Mobile (<640px): 16px margin all sides.
              Tablet+ (≥640px): 5vh top+bottom, centered, max-w-lg. */}
          <div className="
            absolute inset-4
            sm:inset-auto sm:top-[5vh] sm:bottom-[5vh]
            sm:left-1/2 sm:-translate-x-1/2
            sm:w-full sm:max-w-lg
            bg-white flex flex-col overflow-hidden
          ">
            {/* Modal header */}
            <div className="shrink-0 border-b border-gold-100 px-6 py-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-1">
                  Member Registration
                </p>
                <h2 className="font-serif text-xl text-stone-800 tracking-wide leading-snug">
                  Create Your Windsor Beauty Member Account
                </h2>
              </div>
              <button
                onClick={closeModal}
                aria-label="Close registration"
                className="shrink-0 mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6"
              style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {/* What happens next — stated BEFORE the form so nobody
                  registers without knowing exactly what to expect. */}
              <div className="border border-gold-200 bg-gold-50/60 px-4 py-4 mb-6">
                <p className="text-[10px] tracking-[0.24em] uppercase text-gold-700 font-semibold mb-2.5">
                  What happens when you register
                </p>
                <ol className="space-y-1.5 text-xs text-stone-600 leading-relaxed list-none">
                  <li className="flex gap-2">
                    <span className="text-gold-700 font-semibold shrink-0">1.</span>
                    We email you a <span className="font-semibold">verification link</span> straight away.
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-700 font-semibold shrink-0">2.</span>
                    <span>
                      You must click it to activate your account. The link expires in{' '}
                      <span className="font-semibold">48 hours</span>.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-700 font-semibold shrink-0">3.</span>
                    <span>
                      Once verified, your <span className="font-semibold">10% discount code</span>{' '}
                      is emailed to you and your membership is active.
                    </span>
                  </li>
                </ol>
                <p className="text-[11px] text-stone-500 leading-relaxed mt-2.5">
                  Can&rsquo;t find the email? Please check your spam or junk folder.
                </p>
              </div>
              <MemberRegistrationForm
                onSubmit={handleRegister}
                submitLabel="Create My Account"
                submitting={submitting}
                serverError={serverError}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
