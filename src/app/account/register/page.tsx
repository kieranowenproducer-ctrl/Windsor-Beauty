'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import MemberRegistrationForm, { type MemberFormData } from '@/components/MemberRegistrationForm';
import { getVisitId } from '@/lib/analytics/shopTracking';
import { jumpScrollTo } from '@/components/viewportOwner';

export default function AccountRegisterPage() {
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // True once registration itself succeeds — the 10% discount code is never
  // shown here. It is only ever sent by email, and only after the customer
  // verifies their address (see /api/account/verify-email).
  const [createdAwaitingVerification, setCreatedAwaitingVerification] = useState(false);
  const [referralWarning, setReferralWarning] = useState(false);
  const [createdEmailVerified, setCreatedEmailVerified] = useState(false);

  useLayoutEffect(() => {
    if (!createdAwaitingVerification) return;
    // The long form has been replaced. Keep the new confirmation visible and
    // announce it without letting focus scroll back to the old submit button.
    confirmationHeading.current?.focus({ preventScroll: true });
    jumpScrollTo(0);
    // Browser scroll anchoring can run as the shorter view is laid out.
    // Repeat before the next paint, after the form and its focus are gone.
    const frame = requestAnimationFrame(() => jumpScrollTo(0));
    return () => cancelAnimationFrame(frame);
  }, [createdAwaitingVerification]);

  async function handleSubmit(data: MemberFormData) {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, visit_id: getVisitId() }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.redirect) {
        if (json.referralWarning) {
          setReferralWarning(true);
          setCreatedEmailVerified(Boolean(json.emailVerified));
          setCreatedAwaitingVerification(true);
          return;
        }
        if (json.emailVerified) {
          // Already-verified account (e.g. completed an old pending lead) —
          // nothing to wait for, go straight in.
          // Match sign-in: a fresh request includes the new session cookie,
          // without a cached account view or the old form's scroll position.
          window.location.assign(json.redirect);
        } else {
          setCreatedEmailVerified(false);
          setCreatedAwaitingVerification(true);
        }
      } else {
        setError(json?.error || 'We could not create your account. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (createdAwaitingVerification) {
    return (
      <div className="max-w-md mx-auto px-4 py-16" style={{ overflowAnchor: 'none' }}>
        <div className="text-center mb-8">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">You Are In</p>
          <h1 ref={confirmationHeading} tabIndex={-1} className="font-serif text-3xl text-stone-800 tracking-wide">{createdEmailVerified ? 'Your Account Is Ready' : 'Check Your Email'}</h1>
        </div>

        <div className="beauty-form-panel p-6 sm:p-8 text-center">
          {referralWarning && <p role="alert" className="text-sm text-amber-900 bg-amber-50 border border-amber-300 p-3 mb-5">
            Your account was created, but the referral was not recorded. Please contact Windsor Beauty before ordering so our team can check it.
          </p>}
          {!createdEmailVerified && <p className="text-sm text-stone-600 leading-relaxed mb-5">
            Your Windsor Beauty account has been created. We have sent a verification link to your
            email address - click it to confirm your account and unlock your 10% first-order
            discount code, which we will email to you straight away.
          </p>}
          {!createdEmailVerified && <p className="text-[10px] text-stone-500 leading-relaxed mb-6">
            Did not get the email? Check your spam folder, or sign in and request a new link from
            your account page.
          </p>}
          <a
            href="/account"
            className="block w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
          >
            Continue to My Account
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16" style={{ overflowAnchor: 'none' }}>
      <div className="text-center mb-8">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Beauty</p>
        <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Create an Account</h1>
        <p className="text-xs text-stone-500 mt-2 leading-relaxed">
          Register as a Windsor Beauty member to track your orders, check out faster, and unlock
          10% off your first order once you verify your email.
        </p>
      </div>

      <div className="beauty-form-panel p-6 sm:p-8">
        <MemberRegistrationForm
          onSubmit={handleSubmit}
          submitLabel="Create an Account"
          submitting={submitting}
          serverError={error}
        />
      </div>

      <p className="text-center text-xs text-stone-500 mt-6">
        Already have an account?{' '}
        <Link href="/account/login" className="text-gold-700 hover:text-gold-800 font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
