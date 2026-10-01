'use client';

import { useEffect, useState } from 'react';
import CountrySelect from '@/components/CountrySelect';
import MarketingOptInPrompt from '@/components/MarketingOptInPrompt';
import SocialProfilePrompt from '@/components/SocialProfilePrompt';
import Link from 'next/link';
import {
  REFERRAL_SOURCES, composeReferral, referralNeedsDetail,
} from '@/lib/referralSources';
import { COMPLIANCE_CONFIRMATIONS, COMPLIANCE_CONFIRMATIONS_ERROR, type ComplianceKey } from '@/lib/complianceConfirmations';

const PHONE_PATTERN = /^[+\d][\d\s()-]{6,19}$/;

// The one mandatory confirmation before an account can be created: the Terms and Conditions and
// the Privacy Policy. The wording lives in src/lib/complianceConfirmations.ts, and its key matches
// the boolean the register/subscribe APIs re-check server-side, so a locked button is not the only
// thing standing between someone and an account.
const CONFIRMATIONS = COMPLIANCE_CONFIRMATIONS;

type ConfirmationKey = ComplianceKey;

const inputCls =
  'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white disabled:bg-stone-50 disabled:text-stone-400 transition-colors';
const labelCls = 'block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5';

export interface MemberFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressPostcode: string;
  addressCountry: string;
  referredBy: string;
  instagramProfile: string;
  facebookProfile: string;
  referralCode: string;
  affiliateInvite: string;
  password: string;
  confirmPassword: string;
  marketingConsent: boolean;
  termsAccepted: boolean;
}

interface Props {
  onSubmit: (data: MemberFormData) => Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
  serverError?: string;
}

export default function MemberRegistrationForm({
  onSubmit,
  submitLabel = 'Become a Member',
  submitting = false,
  serverError,
}: Props) {
  const affiliateSignupEnabled = process.env.NEXT_PUBLIC_WB_AFFILIATE_CUSTOMER_ACCESS_ENABLED === 'true' || process.env.NODE_ENV !== 'production';
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    addressCity: '',
    addressPostcode: '',
    addressCountry: 'GB',
    referredBy: '',
    instagramProfile: '',
    facebookProfile: '',
    referralCode: '',
    affiliateInvite: '',
    password: '',
    confirmPassword: '',
  });
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [inviteStatus, setInviteStatus] = useState<'none' | 'checking' | 'valid' | 'invalid'>('none');
  // The address a private invitation was made for. Filled in and locked, because the invitation only
  // works with that address and retyping it was the one step people could get wrong.
  const [inviteEmail, setInviteEmail] = useState('');
  /* The one last ask before somebody joins without the offers. `optInAsked` is what makes it
   * happen ONCE: a person who says no and then corrects a server-side error is not asked again,
   * which is the difference between a fair nudge and the thing that stops consent counting. */
  const [showOptIn, setShowOptIn] = useState(false);
  const [optInAsked, setOptInAsked] = useState(false);
  const [showSocialPrompt, setShowSocialPrompt] = useState(false);
  const [socialPromptAsked, setSocialPromptAsked] = useState(false);

  /* WHERE THEY HEARD ABOUT US, held as two answers and saved as one (task 38962e15).
   *
   * `form.referredBy` stays exactly what it always was, one string on the customer, so the
   * sign-up route, the member's account page, the admin list and the customer page all carry on
   * reading the same field. Only the way it is ANSWERED has changed. */
  const [referralSource, setReferralSource] = useState('');
  const [referralDetail, setReferralDetail] = useState('');
  const needsDetail = referralNeedsDetail(referralSource);

  // The mandatory confirmation. It must be ticked before the account can be created.
  const [confirmations, setConfirmations] = useState<Record<ConfirmationKey, boolean>>({
    termsAccepted: false,
  });

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WB_MEMBER_REFERRALS_ENABLED !== 'true') return;
    const code = new URLSearchParams(window.location.search).get('referralCode');
    if (code) setForm(prev => ({ ...prev, referralCode: code.toUpperCase().slice(0, 32) }));
  }, []);

  useEffect(() => {
    if (!affiliateSignupEnabled) return;
    const token = new URLSearchParams(window.location.search).get('affiliateInvite');
    if (token) {
      setReferralSource('RAF affiliate');
      setForm(prev => ({ ...prev, referralCode: '', affiliateInvite: token.slice(0, 64) }));
      setInviteStatus('checking');
      fetch(`/api/affiliate-invitation?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
        .then(response => response.json())
        .then(result => {
          setInviteStatus(result?.valid ? 'valid' : 'invalid');
          if (result?.valid && typeof result.email === 'string') {
            setInviteEmail(result.email);
            setForm(prev => ({ ...prev, email: result.email }));
          }
        })
        .catch(() => setInviteStatus('invalid'));
    }
  }, [affiliateSignupEnabled]);

  const allConfirmed = CONFIRMATIONS.every(c => c.keys.every(key => confirmations[key]));
  const canSubmit = allConfirmed && !submitting;

  /* Ticked as one sentence, recorded as every boolean that sentence covers. */
  function toggleConfirmation(keys: readonly ConfirmationKey[]) {
    setConfirmations(prev => {
      const turningOn = !keys.every(key => prev[key]);
      const next = { ...prev };
      for (const key of keys) next[key] = turningOn;
      return next;
    });
  }

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    if (!PHONE_PATTERN.test(form.phone.trim())) {
      setValidationError('Please enter a valid phone number.');
      return;
    }
    if (!form.addressLine1.trim() || !form.addressCity.trim() || !form.addressPostcode.trim()) {
      setValidationError('Please enter your full address, including postcode.');
      return;
    }
    if (!form.referralCode.trim() && !referralSource) {
      setValidationError('Please tell us where you heard about Windsor Beauty.');
      return;
    }
    /* The follow-up is asked for because the answer is worth having, so an empty one is refused
     * rather than quietly saved as the bare channel. "A friend told me" with no name is the
     * answer the old typing box already gave too often. */
    if (!form.referralCode.trim() && needsDetail && referralDetail.trim().length < 2) {
      const asked = REFERRAL_SOURCES.find(s => s.value === referralSource)?.detailLabel;
      setValidationError(asked ?? 'Please add a little more detail.');
      return;
    }
    if (referralSource === 'RAF affiliate' && inviteStatus !== 'valid') {
      setValidationError('This invitation is not ready. Please ask for a new private link.');
      return;
    }
    if (form.password.length < 8) {
      setValidationError('Your password must be at least 8 characters long.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setValidationError('Your passwords do not match.');
      return;
    }
    if (!allConfirmed) {
      setValidationError(COMPLIANCE_CONFIRMATIONS_ERROR);
      return;
    }

    /* THE LAST ASK (Kieran, 7 September 2026).
     *
     * Everything above this line has passed, so the form is complete and correct and the only
     * question left is the optional one. If the marketing box is unticked, ask once before
     * creating the account. Most people who leave it unticked are not refusing the offers, they
     * simply never read a line of small grey text sitting between the password fields and the
     * confirmation they had to tick.
     *
     * It is asked HERE, after validation, on purpose. Asking before the checks would mean somebody
     * with a mistyped password answers the marketing question and is then sent back to fix the
     * password, and would meet it all over again on the next press. One ask, once, and only when
     * the press was otherwise going to create the account.
     */
    if (!form.instagramProfile.trim() && !form.facebookProfile.trim() && !socialPromptAsked) {
      setSocialPromptAsked(true);
      setShowSocialPrompt(true);
      return;
    }

    await finishSubmit();
  }

  async function finishSubmit() {
    setShowSocialPrompt(false);
    if (!marketingConsent && !optInAsked) {
      setOptInAsked(true);
      setShowOptIn(true);
      return;
    }
    await submitWith(marketingConsent);
  }

  /* Both answers land here and both create the account. The pop-up never blocks anybody from
   * joining: it changes one boolean and gets out of the way. */
  async function submitWith(consent: boolean) {
    setShowOptIn(false);
    await onSubmit({
      ...form,
      referredBy: form.referralCode.trim()
        ? composeReferral('A friend or word of mouth', 'Member referral')
        : composeReferral(referralSource, referralDetail),
      instagramProfile: form.instagramProfile.trim(),
      facebookProfile: form.facebookProfile.trim(),
      marketingConsent: consent,
      ...confirmations,
    });
  }

  const displayError = validationError || serverError;

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      {inviteStatus === 'valid' && (
        <div className="border border-gold-300 bg-stone-900 px-5 py-5 text-white">
          <p className="text-[9px] uppercase tracking-[0.3em] text-gold-300">Private invitation</p>
          <p className="mt-2 font-serif text-xl leading-snug">Welcome. Your invitation is ready.</p>
          <p className="mt-2 text-xs leading-relaxed text-stone-300">
            Fill in your details below. When you confirm your email, we send you 10% off your first order and your own 5% personal code. Both also appear in your account.
          </p>
        </div>
      )}
      {inviteStatus === 'invalid' && (
        <p role="alert" className="border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          This invitation has expired or has already been used. Please ask for a new one.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="member-firstName">First Name</label>
          <input
            id="member-firstName"
            type="text"
            value={form.firstName}
            onChange={update('firstName')}
            required
            disabled={submitting}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="member-lastName">Last Name</label>
          <input
            id="member-lastName"
            type="text"
            value={form.lastName}
            onChange={update('lastName')}
            required
            disabled={submitting}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="member-email">Email Address</label>
        <input
          id="member-email"
          type="email"
          value={form.email}
          onChange={update('email')}
          required
          autoComplete="email"
          disabled={submitting}
          readOnly={Boolean(inviteEmail)}
          aria-describedby={inviteEmail ? 'member-email-invite' : undefined}
          className={`${inputCls}${inviteEmail ? ' bg-stone-50 text-stone-600' : ''}`}
        />
        {inviteEmail && <p id="member-email-invite" className="text-[10px] text-stone-500 mt-1.5 leading-relaxed">Filled in from your invitation. It only works with this address.</p>}
      </div>

      <div>
        <label className={labelCls} htmlFor="member-phone">Mobile Number</label>
        <input
          id="member-phone"
          type="tel"
          value={form.phone}
          onChange={update('phone')}
          required
          autoComplete="tel"
          disabled={submitting}
          className={inputCls}
        />
      </div>

      <div className="border-t border-gold-100 pt-4">
        <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-3">
          Delivery Address
        </p>
        <div className="space-y-3">
          <div>
            <label className={labelCls} htmlFor="member-addressLine1">Address Line 1</label>
            <input
              id="member-addressLine1"
              type="text"
              value={form.addressLine1}
              onChange={update('addressLine1')}
              required
              disabled={submitting}
              autoComplete="address-line1"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="member-addressLine2">
              Address Line 2{' '}
              <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="member-addressLine2"
              type="text"
              value={form.addressLine2}
              onChange={update('addressLine2')}
              disabled={submitting}
              autoComplete="address-line2"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} htmlFor="member-addressCity">City</label>
              <input
                id="member-addressCity"
                type="text"
                value={form.addressCity}
                onChange={update('addressCity')}
                required
                disabled={submitting}
                autoComplete="address-level2"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="member-addressPostcode">Postcode</label>
              <input
                id="member-addressPostcode"
                type="text"
                value={form.addressPostcode}
                onChange={update('addressPostcode')}
                required
                disabled={submitting}
                autoComplete="postal-code"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="member-addressCountry">Country</label>
            <CountrySelect
              id="member-addressCountry"
              value={form.addressCountry}
              onChange={update('addressCountry')}
              className={inputCls}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-gold-100 pt-4">
        {!form.affiliateInvite && (process.env.NEXT_PUBLIC_WB_MEMBER_REFERRALS_ENABLED === 'true' || process.env.NEXT_PUBLIC_WB_GLOW_CARD_LOYALTY_ENABLED === 'true') && (
          <div className="mb-4">
            <label className={labelCls} htmlFor="member-referralCode">Member referral code (optional)</label>
            <input
              id="member-referralCode" type="text" value={form.referralCode}
              onChange={update('referralCode')} maxLength={32} disabled={submitting}
              autoComplete="off" className={inputCls}
            />
            <p className="text-[10px] text-stone-500 mt-1.5">
              A friend who joins through your link earns a referral point with you after their first paid signed-in £30+ product order.
            </p>
            <Link href="/glow-card-terms" target="_blank" className="inline-block text-[10px] text-gold-700 underline underline-offset-4 mt-1.5">
              Read the Beauty Card terms
            </Link>
          </div>
        )}
        {!form.referralCode.trim() && <>
        <label className={labelCls} htmlFor="referredBy">
          Where did you hear about Windsor Beauty?
        </label>
        <select
          id="referredBy"
          value={referralSource}
          onChange={e => {
            setReferralSource(e.target.value);
            setReferralDetail('');
          }}
          required
          disabled={submitting || Boolean(form.affiliateInvite)}
          className={inputCls}
        >
          <option value="">Please choose one</option>
          {REFERRAL_SOURCES.filter(source => source.value !== 'RAF affiliate' || Boolean(form.affiliateInvite)).map(source => (
            <option key={source.value} value={source.value}>{source.label}</option>
          ))}
        </select>

        {/* Only for the choices where the detail is worth more than the channel. Clearing it on
            every change is deliberate: picking one answer, typing its detail, then changing to
            "Instagram" must not leave that detail attached to Instagram. */}
        {needsDetail && (
          <div className="mt-3">
            <label className={labelCls} htmlFor="referredByDetail">
              {REFERRAL_SOURCES.find(s => s.value === referralSource)?.detailLabel}
            </label>
            <input
              id="referredByDetail"
              type="text"
              value={referralDetail}
              onChange={e => setReferralDetail(e.target.value)}
              required
              disabled={submitting}
              maxLength={80}
              className={inputCls}
            />
          </div>
        )}

        {referralSource === 'RAF affiliate' && (
          <div className="mt-3 rounded-sm border border-gold-200 bg-gold-50/50 p-4">
            <p className={labelCls}>Private invitation</p>
            <p className="mt-2 text-[10px] leading-relaxed text-stone-600">
              {inviteStatus === 'checking' ? 'Checking your invitation.' : inviteStatus === 'valid'
                ? 'After you confirm your email, your welcome code and your personal code are emailed to you and shown in your account. Use one code per order.'
                : 'This invitation has expired or has already been used. Please ask for a new link.'}
            </p>
          </div>
        )}

        <p className="text-[9px] text-stone-500 mt-1.5 leading-relaxed">
          It helps us know where our customers are finding us. If none of these fit, choose
          &ldquo;Something else&rdquo;.
        </p>
        </>}
      </div>

      <div className="border-t border-gold-100 pt-4 space-y-3">
        <div>
          <label className={labelCls} htmlFor="member-password">Password</label>
          <input
            id="member-password"
            type="password"
            value={form.password}
            onChange={update('password')}
            required
            autoComplete="new-password"
            disabled={submitting}
            className={inputCls}
            aria-describedby="member-password-hint"
          />
          <p id="member-password-hint" className="text-[9px] text-stone-500 mt-1">At least 8 characters.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="member-confirmPassword">Confirm Password</label>
          <input
            id="member-confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            required
            autoComplete="new-password"
            disabled={submitting}
            className={inputCls}
          />
        </div>
      </div>

      {/* Password, then marketing, then the social profiles it relates to (Samuel, 27 Sep 2026). */}
      <div id="social-profiles" className="border-t border-gold-100 pt-4 space-y-3">
        <label className="flex items-start gap-2.5 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={e => setMarketingConsent(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 w-4 h-4 accent-gold-500 shrink-0"
          />
          <span className="text-xs text-stone-500 leading-relaxed">
            Keep me updated about Windsor Beauty products and exclusive offers.
          </span>
        </label>
        <p className="text-xs text-stone-600 leading-relaxed">
          Add your social profiles to hear about Windsor Beauty offers there.
        </p>
        <div>
          <label className={labelCls} htmlFor="instagramProfile">Instagram username</label>
          <input id="instagramProfile" type="text" value={form.instagramProfile}
            onChange={update('instagramProfile')} disabled={submitting} maxLength={100}
            autoComplete="off" placeholder="e.g. @yourname" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="facebookProfile">Facebook profile name</label>
          <input id="facebookProfile" type="text" value={form.facebookProfile}
            onChange={update('facebookProfile')} disabled={submitting} maxLength={100}
            autoComplete="off" placeholder="e.g. Jane Smith" className={inputCls} />
        </div>
      </div>

      {/* The mandatory confirmation. Marketing above stays optional; this box has to be ticked. */}
      <div className="border-t border-gold-100 pt-4">
        <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-3">
          Before you join
        </p>

        <div className="space-y-2 sm:space-y-1">
          {CONFIRMATIONS.map(({ id, keys, label, links }) => {
            const ticked = keys.every(key => confirmations[key]);
            return (
            <div key={id}>
            <label
              htmlFor={`member-confirm-${id}`}
              className="flex items-start gap-3 cursor-pointer group py-3 sm:py-2 px-1 -mx-1 rounded-sm"
            >
              <input
                type="checkbox"
                id={`member-confirm-${id}`}
                checked={ticked}
                onChange={() => toggleConfirmation(keys)}
                disabled={submitting}
                className="sr-only peer"
              />
              <div
                aria-hidden="true"
                className={`mt-0.5 h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0 border transition-all duration-150 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400 peer-focus-visible:ring-offset-2 ${
                  ticked ? 'bg-gold-700 border-gold-500' : 'border-gold-300 bg-white group-hover:border-gold-400'
                }`}
              >
                {ticked && (
                  <svg className="w-3 h-3 sm:w-2.5 sm:h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-xs font-semibold text-stone-700 leading-relaxed select-none">{label}</span>
            </label>
            {/* The links sit outside the tickable sentence, so opening a document never toggles
                the box. The /terms and /privacy pages are exempt from the coming-soon wall
                (see proxy.ts), so these links work pre-launch too. */}
            <p className="ml-8 sm:ml-7 flex flex-wrap gap-x-4 gap-y-1">
              {links.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener"
                  className="text-[11px] underline text-gold-700 hover:text-gold-800"
                >
                  Read the {link.text}
                </a>
              ))}
            </p>
            </div>
            );
          })}
        </div>
      </div>

      {displayError && (
        <p className="text-xs text-red-500 leading-relaxed pt-1">{displayError}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full text-[10px] tracking-[0.22em] uppercase py-3.5 transition-all duration-150 mt-2 ${
          canSubmit
            ? 'bg-gold-700 text-white hover:bg-gold-800 cursor-pointer'
            : 'bg-stone-100 text-stone-500 cursor-not-allowed'
        }`}
      >
        {submitting ? 'Creating your account…' : submitLabel}
      </button>

      {!canSubmit && !submitting && (
        <p className="text-[10px] text-stone-500 leading-relaxed text-center">
          Tick the box above to unlock this button.
        </p>
      )}
    </form>

    {/* Outside the <form> on purpose: it is an overlay, and its buttons must never
        act as this form's submit control. Both answers create the account. */}
    <MarketingOptInPrompt
      open={showOptIn}
      busy={submitting}
      onOptIn={() => { setMarketingConsent(true); void submitWith(true); }}
      onDecline={() => { void submitWith(false); }}
    />
    <SocialProfilePrompt
      open={showSocialPrompt}
      busy={submitting}
      onAdd={() => {
        setShowSocialPrompt(false);
        document.getElementById('instagramProfile')?.focus();
      }}
      onContinue={() => { void finishSubmit(); }}
    />
    </>
  );
}
