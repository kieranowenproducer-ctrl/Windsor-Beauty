'use client';

import type { FooterContent, FooterEmail, FooterLink } from '@/lib/footerContent';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  footerContent: FooterContent;
  updateFooterField: (patch: Partial<Pick<FooterContent, 'description' | 'disclaimer' | 'copyrightSuffix' | 'bottomRightText'>>) => void;
  updateFooterEmail: (index: number, patch: Partial<FooterEmail>) => void;
  updateFooterNavLink: (index: number, patch: Partial<FooterLink>) => void;
  updateFooterLegalLink: (index: number, patch: Partial<FooterLink>) => void;
  handleSaveFooter: () => void;
  handleResetFooter: () => void;
  footerSaving: boolean;
  footerMessage: string;
  footerOverridden: boolean;
}

export default function FooterContentSection({
  footerContent, updateFooterField, updateFooterEmail, updateFooterNavLink, updateFooterLegalLink,
  handleSaveFooter, handleResetFooter, footerSaving, footerMessage, footerOverridden,
}: Props) {
  return (
    <>
            {/* Footer / navigation content */}
            <div id="section-footer-content" className="bg-white border border-stone-200 p-6">
              <h2 className="text-sm font-semibold text-stone-800 mb-1">Footer &amp; Navigation</h2>
              <p className="text-xs text-stone-400 mb-4 leading-relaxed">
                Edit the text and links shown in the site footer — the brand description, contact emails, the
                Navigation and Legal link columns, the research disclaimer, and the copyright line. Changes appear
                on the live site as soon as they&apos;re saved.
              </p>

              <label className="flex flex-col gap-1.5 mb-4">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Brand Description</span>
                <textarea
                  value={footerContent.description}
                  onChange={(e) => updateFooterField({ description: e.target.value })}
                  rows={3}
                  className="border border-stone-200 px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-gold-400 transition-colors resize-none"
                />
              </label>

              <div className="mb-5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400 block mb-2">Contact Emails</span>
                <div className="space-y-2">
                  {footerContent.emails.map((email, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-stone-100 p-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[9px] tracking-[0.12em] uppercase text-stone-400">Email Address</span>
                        <input
                          type="text"
                          value={email.address}
                          onChange={(e) => updateFooterEmail(i, { address: e.target.value })}
                          className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[9px] tracking-[0.12em] uppercase text-stone-400">Label</span>
                        <input
                          type="text"
                          value={email.label}
                          onChange={(e) => updateFooterEmail(i, { label: e.target.value })}
                          className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400 block mb-2">Navigation Links</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {footerContent.navLinks.map((link, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 border border-stone-100 p-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[9px] tracking-[0.12em] uppercase text-stone-400">Label</span>
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => updateFooterNavLink(i, { label: e.target.value })}
                          className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[9px] tracking-[0.12em] uppercase text-stone-400">URL</span>
                        <input
                          type="text"
                          value={link.href}
                          onChange={(e) => updateFooterNavLink(i, { href: e.target.value })}
                          className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400 block mb-2">Legal Links</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {footerContent.legalLinks.map((link, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 border border-stone-100 p-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[9px] tracking-[0.12em] uppercase text-stone-400">Label</span>
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => updateFooterLegalLink(i, { label: e.target.value })}
                          className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[9px] tracking-[0.12em] uppercase text-stone-400">URL</span>
                        <input
                          type="text"
                          value={link.href}
                          onChange={(e) => updateFooterLegalLink(i, { href: e.target.value })}
                          className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5 mb-4">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Research Disclaimer</span>
                <textarea
                  value={footerContent.disclaimer}
                  onChange={(e) => updateFooterField({ disclaimer: e.target.value })}
                  rows={3}
                  className="border border-stone-200 px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-gold-400 transition-colors resize-none"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Copyright Line (after the year)</span>
                  <input
                    type="text"
                    value={footerContent.copyrightSuffix}
                    onChange={(e) => updateFooterField({ copyrightSuffix: e.target.value })}
                    className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Bottom-Right Text</span>
                  <input
                    type="text"
                    value={footerContent.bottomRightText}
                    onChange={(e) => updateFooterField({ bottomRightText: e.target.value })}
                    className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveFooter}
                  disabled={footerSaving}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {footerSaving ? 'Saving…' : 'Save Footer'}
                </button>
                {footerOverridden && (
                  <button
                    onClick={handleResetFooter}
                    disabled={footerSaving}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Reset to Default
                  </button>
                )}
                {footerMessage && (
                  <p className="text-xs text-stone-500">{footerMessage}</p>
                )}
              </div>
            </div>
    </>
  );
}
