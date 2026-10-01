'use client';

import { useEffect, useRef, useState } from 'react';
import { useDialog } from './useDialog';
import { useViewportOwner } from './viewportOwner';
import RichTextContent from './RichTextContent';
import { markdownLiteToHtml } from '@/lib/markdownLite';

interface TermsAcceptanceModalProps {
  open: boolean;
  onAccept: () => void;
  onClose: () => void;
  override?: { title: string | null; body: string; format?: string } | null;
}

const SECTIONS: { heading: string; body: string }[] = [
  {
    heading: '1. Who We Are',
    body: 'Windsor Glow is operated by C&S Holdings Group ("Windsor Glow", "we", "us", "our"). References to "you" or "the customer" mean the person browsing this site or placing an order with us.',
  },
  {
    heading: '2. Acceptance of These Terms',
    body: 'By entering this website, browsing our catalogue, creating an account, or placing an order, you confirm that you have read, understood, and agree to be bound by these Terms and Conditions, together with our Privacy Policy, Cookie Policy, Shipping Policy, Returns Policy, Product Disclaimer, Research Use Disclaimer, Payment Policy and Age Restriction Policy, each of which forms part of this agreement.',
  },
  {
    heading: '3. Eligibility to Use This Site',
    body: 'This website and the products listed on it are intended exclusively for laboratory and research use by adults. You confirm, by using this site, that you are at least 18 years of age and that you are accessing the site for legitimate research purposes, in line with our Age Restriction Policy.',
  },
  {
    heading: '4. Products and Descriptions',
    body: 'We take care to describe our products accurately, including purity figures and supporting documentation where applicable. However, product images, packaging and presentation may vary from those shown on the site. Please refer to our Product Disclaimer and Research Use Disclaimer for important information about the intended use of everything we sell.',
  },
  {
    heading: '5. Needle Usage Disclaimer',
    body: 'Where needles, syringes or other sharps are supplied with a product, whether included in the package or offered as a separate accessory, they are provided solely to support the lawful handling, mixing and reconstitution of research compounds within a controlled laboratory or research setting. They are not intended for human or animal use, and no representation is made that they are suitable, sterile, or approved for use on or in a human or animal body. You are responsible for ensuring that the acquisition, storage, handling, use and disposal of any needles or sharps supplied with or alongside our products complies with the law in your jurisdiction, and for following appropriate sharps-handling and disposal procedures at all times.',
  },
  {
    heading: '6. Research Use Disclaimer',
    body: 'Not for Human or Animal Consumption. All products listed on this website are sold exclusively for in-vitro laboratory research and experimental use. They are not for human or animal consumption in any form, by any route, and must not be ingested, injected, inhaled, applied to the body, or otherwise introduced into a human or animal under any circumstances.\n\nSold to Qualified Researchers. By placing an order, you confirm that you are purchasing as a qualified individual or organisation conducting legitimate laboratory research, that you understand the handling and storage requirements of research compounds, and that you will use any product purchased from us solely within a controlled research environment.\n\nNo Endorsement of Other Use. Windsor Glow does not endorse, encourage, or condone the use of any product sold on this site for purposes other than laboratory research. Any reference material we provide, including our Dosage Guide and calculator, exists only to support consistent handling and reconstitution of compounds for research purposes, and carries no implication that the product is suitable, safe, or approved for any other use.\n\nCompliance With Local Law. It is your responsibility to ensure that purchasing, possessing, and using any product from this site is lawful in your jurisdiction, and that you comply with any licensing, storage, or handling requirements that apply to research compounds where you are located.\n\nAcceptance of This Disclaimer. By using this website and placing an order, you confirm that you have read and understood this Research Use Disclaimer and agree to be bound by it, alongside our Product Disclaimer, Age Restriction Policy, and Terms and Conditions.',
  },
  {
    heading: '7. Research Use and Medical Disclaimer',
    body: 'Every product listed on this website is supplied strictly for laboratory and scientific research purposes. None of our products are intended for human consumption, and they must not be ingested, injected, inhaled, applied to the body, or otherwise introduced into a human or animal under any circumstances. Nothing we sell is intended to diagnose, treat, cure or prevent any disease, condition or ailment, and no product should be regarded as a medicine, supplement or therapeutic substance. Windsor Glow does not provide medical advice, and nothing on this website — including product descriptions, dosage information, or any supporting guides or calculators — should be read or relied upon as such; where we do publish reference material of this kind, it exists solely to support the accurate handling and reconstitution of compounds within a controlled research environment, for informational purposes only. You are responsible for satisfying yourself that purchasing, possessing and using any product from this site is lawful and appropriate in your circumstances and jurisdiction, and for ensuring it is handled only by suitably qualified persons in a proper research setting. If you have a medical question or concern, please seek guidance from a qualified healthcare professional rather than relying on anything published here. By entering this website, creating an account, or placing an order, you confirm that you understand and accept this disclaimer in full, in addition to our dedicated Research Use Disclaimer and Product Disclaimer.',
  },
  {
    heading: '8. Orders and Acceptance',
    body: 'Placing an order through this website is an offer by you to purchase the listed products. We may accept or decline that offer at our discretion — for example, where stock is unavailable, where pricing has been displayed in error, or where we have reason to believe an order does not meet our eligibility requirements. A contract is only formed once we confirm that your order has been accepted and dispatched.',
  },
  {
    heading: '9. Pricing and Availability',
    body: 'All prices are shown in pounds sterling and are correct at the time of publishing, but may change without notice. We make every effort to ensure stock levels shown on the site are accurate; occasionally an item may become unavailable after you have placed an order, in which case we will contact you to discuss alternatives, a partial refund, or a full refund.',
  },
  {
    heading: '10. Your Account',
    body: 'If you create an account with us, you are responsible for keeping your login details confidential and for all activity that takes place under your account. Please let us know immediately if you believe your account has been accessed without your permission.',
  },
  {
    heading: '11. Intellectual Property',
    body: 'All content on this site — including text, graphics, logos, product photography and layout — belongs to Windsor Glow or its licensors and is protected by copyright and other intellectual property laws. You may view and print pages for your own personal reference, but may not reproduce, redistribute or otherwise commercially exploit any part of this site without our written permission.',
  },
  {
    heading: '12. Limitation of Liability',
    body: 'Nothing in these terms limits or excludes our liability where it would be unlawful to do so. Subject to that, we are not liable for any indirect or consequential loss arising from your use of this site or our products, including any loss arising from use of our products outside of the research purposes for which they are sold.',
  },
  {
    heading: '13. Changes to These Terms',
    body: 'We may update these terms from time to time to reflect changes in our business, our products, or relevant law. The version published on the Terms and Conditions page at the time you place an order is the version that applies to that order. We recommend checking it periodically.',
  },
  {
    heading: '14. Governing Law',
    body: 'These terms are governed by the laws of England and Wales, and any disputes relating to them will be subject to the exclusive jurisdiction of the courts of England and Wales.',
  },
];

const SCROLL_THRESHOLD_PX = 24;

export default function TermsAcceptanceModal({ open, onAccept, onClose, override }: TermsAcceptanceModalProps) {
  const [reachedEnd, setReachedEnd] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const overrideParagraphs = override?.body?.trim() ? override.body.trim().split(/\n\s*\n/) : null;

  // These are the Terms: a legal step, so it owns the screen while it is open
  // and nothing promotional may draw over it. The same call locks the page
  // behind it (position:fixed stops iOS momentum scroll on the document), but
  // through the shared counter rather than by setting body styles here.
  //
  // It used to set those four properties itself and clear them back to '' on
  // the way out. The 10% pop-up did exactly the same thing, so whichever closed
  // first unlocked the page underneath the other and scrolled the customer to
  // whatever position it had captured. The counter in viewportOwner.ts unlocks
  // only when the last layer has gone.
  useViewportOwner(open, 'terms-modal', { lockScroll: true });

  // onClose is kept in a ref so it never re-triggers this effect.
  useEffect(() => {
    if (!open) {
      setReachedEnd(false);
      setConfirmChecked(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open]);

  // Auto-unlock if content fits without scrolling.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + SCROLL_THRESHOLD_PX) setReachedEnd(true);
  }, [open]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD_PX) setReachedEnd(true);
  }

  // No onClose passed: this component already listens for Escape itself, and
  // the hook would fire it a second time. What the hook adds is the dialog
  // role, the name, focus moving in on open and back out on close, and a Tab
  // key that cannot wander into the notice behind it.
  const dialog = useDialog({ open, labelledBy: 'terms-modal-title' });

  if (!open) return null;

  return (
    /*
     * Outer: fixed inset-0, overflow-hidden. Clips everything cleanly.
     * No flex centering here — the dialog positions itself with absolute edges
     * so it inherits genuine viewport dimensions for its height.
     */
    <div className="fixed inset-0 z-[400] overflow-hidden">

      {/*
       * Backdrop: touch-action none means iOS routes no scroll gestures here.
       * Keeps the page behind completely frozen.
       */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        style={{ touchAction: 'none' }}
        onClick={onClose}
      />

      {/*
       * Dialog shell: absolutely positioned from viewport edges so it has a
       * DEFINITE pixel height at all times — the key requirement for
       * overflow-y-auto to activate on iOS Safari.
       *
       * iOS WebKit bug: max-height on a flex container does NOT create a
       * bounded height for flex distribution. flex-1 min-h-0 children need
       * an explicit height (derived here from absolute top+bottom insets).
       *
       * Mobile  (<640px): 16px margin on all sides → height = 100vh - 32px
       * Tablet+ (≥640px): 5vh top + bottom  → height = 90vh, centred, max-w-2xl
       */}
      <div className="
        absolute inset-4
        sm:inset-auto sm:top-[5vh] sm:bottom-[5vh]
        sm:left-1/2 sm:-translate-x-1/2
        sm:w-full sm:max-w-2xl
        flex flex-col bg-white shadow-2xl overflow-hidden outline-none
      "
        {...dialog}
      >

        {/* Header — fixed, never scrolls */}
        <div className="shrink-0 border-b border-gold-100 px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-0.5">Before You Continue</p>
            <h2 id="terms-modal-title" className="font-serif text-xl text-stone-800 tracking-wide">
              {override?.title?.trim() || 'Terms and Conditions'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close terms and conditions"
            className="text-stone-500 hover:text-stone-700 transition-colors p-1 -mr-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/*
         * Scroll container: flex-1 min-h-0 gives it the remaining height after
         * header + footer within the absolutely-positioned dialog shell.
         * touch-action pan-y is the CSS-level instruction to iOS to route
         * vertical swipe gestures here as native scroll — no JS event
         * prevention needed or wanted.
         * overscroll-behavior contain stops scroll chaining to any parent.
         */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6 space-y-5"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          {override?.format === 'html' && override.body.trim() ? (
            <RichTextContent html={override.body} className="text-xs text-stone-500 leading-relaxed" />
          ) : override?.format === 'markdown' && override.body.trim() ? (
            <RichTextContent html={markdownLiteToHtml(override.body)} className="text-xs text-stone-500 leading-relaxed" />
          ) : overrideParagraphs ? (
            overrideParagraphs.map((paragraph, i) => (
              <p key={i} className="text-xs text-stone-500 leading-relaxed">{paragraph}</p>
            ))
          ) : (
            <>
              <p className="text-xs text-stone-500 leading-relaxed">
                Please read the following terms in full, including sections 5, 6 and 7 below, our Needle Usage
                Disclaimer, Research Use Disclaimer, and Research Use and Medical Disclaimer. Scroll to the bottom of
                this document to unlock the confirmation checkbox and continue.
              </p>
              {SECTIONS.map(section => (
                <div key={section.heading}>
                  <h3 className="text-[11px] tracking-[0.1em] uppercase text-stone-600 font-semibold mb-1.5">
                    {section.heading}
                  </h3>
                  {section.body.includes('\n\n') ? (
                    section.body.split('\n\n').map((paragraph, i) => {
                      const match = paragraph.match(/^([\s\S]+?\.)\s([\s\S]*)$/);
                      return (
                        <p key={i} className="text-xs text-stone-500 leading-relaxed mb-2 last:mb-0">
                          {match ? <><strong className="text-stone-500">{match[1]}</strong> {match[2]}</> : paragraph}
                        </p>
                      );
                    })
                  ) : (
                    <p className="text-xs text-stone-500 leading-relaxed">{section.body}</p>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-stone-500 leading-relaxed pt-2 border-t border-stone-100">
                You have reached the end of these terms. You can also read them in full at any time from the Terms and
                Conditions link in our website footer.
              </p>
            </>
          )}
        </div>

        {/* Footer — fixed, never scrolls, accept button always reachable */}
        <div className="shrink-0 border-t border-gold-100 px-6 py-5">
          {!reachedEnd ? (
            <p className="text-[10px] text-stone-500 text-center mb-4 leading-relaxed">
              Please scroll to the bottom of the Terms and Conditions to enable acceptance.
            </p>
          ) : (
            <label
              htmlFor="terms-confirm-check"
              className="flex items-start gap-3 mb-4 cursor-pointer group py-3 sm:py-2 px-1 -mx-1 rounded-sm"
            >
              <input
                type="checkbox"
                id="terms-confirm-check"
                checked={confirmChecked}
                onChange={() => setConfirmChecked(v => !v)}
                className="sr-only peer"
              />
              <div
                aria-hidden="true"
                className={`mt-0.5 h-5 w-5 sm:h-4 sm:w-4 flex-shrink-0 border transition-all duration-150 flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400 peer-focus-visible:ring-offset-2 ${
                  confirmChecked ? 'bg-gold-700 border-gold-500' : 'border-gold-300 bg-white group-hover:border-gold-400'
                }`}
              >
                {confirmChecked && (
                  <svg className="w-3 h-3 sm:w-2.5 sm:h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className="text-sm font-semibold text-stone-700 leading-relaxed select-none">
                I confirm I have read and agree to the Terms and Conditions and research-use disclaimer.
              </span>
            </label>
          )}
          {/* type="button" on both controls: this modal is rendered inside the
              member sign-up <form>, where an untyped button defaults to submit
              and would fire registration on Accept. */}
          <button
            type="button"
            onClick={onAccept}
            disabled={!reachedEnd || !confirmChecked}
            className={`w-full py-3.5 text-[10px] tracking-[0.22em] uppercase font-semibold transition-all duration-150 ${
              reachedEnd && confirmChecked
                ? 'bg-gold-700 text-white hover:bg-gold-800 cursor-pointer'
                : 'bg-stone-100 text-stone-500 cursor-not-allowed'
            }`}
          >
            Accept &amp; Continue
          </button>
        </div>

      </div>
    </div>
  );
}
