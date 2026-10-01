'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { ContactContent, ContactEmail } from '@/lib/contactContent';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  contact: ContactContent;
  setContact: Dispatch<SetStateAction<ContactContent>>;
  updateEmail: (index: number, patch: Partial<ContactEmail>) => void;
  addEmail: () => void;
  removeEmail: (index: number) => void;
  updateSubjectLabel: (index: number, label: string) => void;
  addSubject: () => void;
  removeSubject: (index: number) => void;
  handleSaveContact: () => void;
  handleResetContact: () => void;
  contactSaving: boolean;
  contactMessage: string;
  contactOverridden: boolean;
}

export default function ContactPageSection({
  contact, setContact, updateEmail, addEmail, removeEmail,
  updateSubjectLabel, addSubject, removeSubject,
  handleSaveContact, handleResetContact, contactSaving, contactMessage, contactOverridden,
}: Props) {
  return (
    <>
            {/* Contact page */}
            <div id="section-contact" className="bg-white border border-stone-200 p-6">
              <h2 className="text-sm font-semibold text-stone-800 mb-1">Contact Page</h2>
              <p className="text-xs text-stone-400 mb-4 leading-relaxed">
                Edit the heading, intro text, email addresses, and subject dropdown options shown on the
                Contact page. The form fields and layout stay the same; only this text and these lists change.
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Eyebrow</span>
                    <input
                      type="text"
                      value={contact.eyebrow}
                      onChange={(e) => setContact(prev => ({ ...prev, eyebrow: e.target.value }))}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Heading</span>
                    <input
                      type="text"
                      value={contact.heading}
                      onChange={(e) => setContact(prev => ({ ...prev, heading: e.target.value }))}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Intro Text</span>
                  <textarea
                    value={contact.intro}
                    onChange={(e) => setContact(prev => ({ ...prev, intro: e.target.value }))}
                    rows={3}
                    className="border border-stone-200 px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-gold-400 transition-colors"
                  />
                </label>

                <div>
                  <span className="block text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-2">
                    Email Addresses
                  </span>
                  <div className="space-y-2">
                    {contact.emails.map((entry, i) => (
                      <div key={i} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="email"
                          value={entry.email}
                          onChange={(e) => updateEmail(i, { email: e.target.value })}
                          placeholder="name@windsorbeauty.co.uk"
                          className="flex-1 border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                        <input
                          type="text"
                          value={entry.label}
                          onChange={(e) => updateEmail(i, { label: e.target.value })}
                          placeholder="Description (e.g. General enquiries)"
                          className="flex-1 border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                        <button
                          onClick={() => removeEmail(i)}
                          disabled={contact.emails.length <= 1}
                          className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2 self-start sm:self-auto"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addEmail}
                    className="mt-2 text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors"
                  >
                    + Add Email
                  </button>
                </div>

                <div>
                  <span className="block text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-2">
                    Subject Dropdown Options
                  </span>
                  <div className="space-y-2">
                    {contact.subjects.map((subject, i) => (
                      <div key={subject.value} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={subject.label}
                          onChange={(e) => updateSubjectLabel(i, e.target.value)}
                          placeholder="Option label"
                          className="flex-1 border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                        <button
                          onClick={() => removeSubject(i)}
                          disabled={contact.subjects.length <= 1}
                          className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addSubject}
                    className="mt-2 text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors"
                  >
                    + Add Option
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveContact}
                  disabled={contactSaving}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {contactSaving ? 'Saving…' : 'Save Contact Page'}
                </button>
                {contactOverridden && (
                  <button
                    onClick={handleResetContact}
                    disabled={contactSaving}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Reset to Default
                  </button>
                )}
                {contactMessage && (
                  <p className="text-xs text-stone-500">{contactMessage}</p>
                )}
              </div>
            </div>
    </>
  );
}
