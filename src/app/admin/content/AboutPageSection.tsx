'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { AboutContent } from '@/lib/aboutContent';
import ImageUploadField from '@/components/admin/ImageUploadField';
import MarkdownLiteEditor from '@/components/admin/MarkdownLiteEditor';
import { AboutParagraphEditor, AboutValueDescEditor } from './ContentEditors';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  about: AboutContent;
  setAbout: Dispatch<SetStateAction<AboutContent>>;
  updateAboutValue: (label: string, desc: string, index: number) => void;
  handleSaveAbout: () => void;
  handleResetAbout: () => void;
  aboutSaving: boolean;
  aboutMessage: string;
  aboutOverridden: boolean;
}

export default function AboutPageSection({
  about, setAbout, updateAboutValue, handleSaveAbout, handleResetAbout,
  aboutSaving, aboutMessage, aboutOverridden,
}: Props) {
  return (
    <>
            {/* About page */}
            <div id="section-about" className="bg-white border border-stone-200 p-6">
              <h2 className="text-sm font-semibold text-stone-800 mb-1">About Page</h2>
              <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                Edit the headings, body text, values, and image shown on the About page. The layout stays
                the same; only the content changes.
              </p>

              <div className="space-y-4">
                <ImageUploadField
                  value={about.imageUrl ?? undefined}
                  onChange={(url) => setAbout(prev => ({ ...prev, imageUrl: url ?? null }))}
                  endpoint="/api/admin/content/upload-image"
                  label="About Page Image (optional)"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Eyebrow</span>
                    <input
                      type="text"
                      value={about.eyebrow}
                      onChange={(e) => setAbout(prev => ({ ...prev, eyebrow: e.target.value }))}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Tagline</span>
                    <input
                      type="text"
                      value={about.tagline}
                      onChange={(e) => setAbout(prev => ({ ...prev, tagline: e.target.value }))}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Heading</span>
                  <input
                    type="text"
                    value={about.heading}
                    onChange={(e) => setAbout(prev => ({ ...prev, heading: e.target.value }))}
                    className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                  />
                </label>

                {about.paragraphs.map((paragraph, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Body Paragraph {i + 1}</span>
                    <AboutParagraphEditor index={i} value={paragraph} setAbout={setAbout} />
                  </div>
                ))}

                <div>
                  <span className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-2">Values</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {about.values.map((value, i) => (
                      <div key={i} className="border border-stone-100 p-3 space-y-2">
                        <input
                          type="text"
                          value={value.label}
                          onChange={(e) => updateAboutValue(e.target.value, value.desc, i)}
                          placeholder="Label"
                          className="w-full border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                        />
                        <AboutValueDescEditor index={i} value={value.desc} setAbout={setAbout} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Group Eyebrow</span>
                    <input
                      type="text"
                      value={about.groupEyebrow}
                      onChange={(e) => setAbout(prev => ({ ...prev, groupEyebrow: e.target.value }))}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Group Heading</span>
                    <input
                      type="text"
                      value={about.groupHeading}
                      onChange={(e) => setAbout(prev => ({ ...prev, groupHeading: e.target.value }))}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Group Body</span>
                  <MarkdownLiteEditor
                    value={about.groupBody}
                    onChange={(text) => setAbout(prev => ({ ...prev, groupBody: text }))}
                    height="100px"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSaveAbout}
                  disabled={aboutSaving}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {aboutSaving ? 'Saving…' : 'Save About Page'}
                </button>
                {aboutOverridden && (
                  <button
                    onClick={handleResetAbout}
                    disabled={aboutSaving}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Reset to Default
                  </button>
                )}
                {aboutMessage && (
                  <p className="text-xs text-stone-500">{aboutMessage}</p>
                )}
              </div>
            </div>
    </>
  );
}
