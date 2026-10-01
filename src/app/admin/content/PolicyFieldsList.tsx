'use client';

import type { Dispatch, SetStateAction } from 'react';
import { CONTENT_FIELDS, type ValuesMap } from './contentFields';
import { PolicyBodyEditor } from './ContentEditors';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  fieldValue: (key: string) => { title: string; body: string };
  setValues: Dispatch<SetStateAction<ValuesMap>>;
  overridden: Set<string>;
  handleSave: (key: string) => void;
  handleReset: (key: string) => void;
  saving: string | null;
  savedMessage: Record<string, string>;
}

export default function PolicyFieldsList({
  fieldValue, setValues, overridden, handleSave, handleReset, saving, savedMessage,
}: Props) {
  return (
    <>
            {CONTENT_FIELDS.map(field => {
              const value = fieldValue(field.key);
              return (
                <div key={field.key} id={`section-${field.key}`} className="bg-white border border-stone-200 p-6">
                  <h2 className="text-sm font-semibold text-stone-800 mb-1">{field.label}</h2>
                  <p className="text-xs text-stone-400 mb-4 leading-relaxed">{field.description}</p>

                  {field.hasTitle && (
                    <label className="flex flex-col gap-1.5 mb-3">
                      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Page Title (optional)</span>
                      <input
                        type="text"
                        value={value.title}
                        onChange={(e) => setValues(prev => ({ ...prev, [field.key]: { ...fieldValue(field.key), title: e.target.value } }))}
                        className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                      />
                    </label>
                  )}

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.15em] uppercase text-stone-400">Content</span>
                    {field.hasTitle && (
                      <span className="text-[10px] text-stone-400 normal-case tracking-normal -mt-1 mb-1">
                        Leave a blank line between paragraphs. Use the toolbar, or type directly:
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">**bold**</code>
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">_italic_</code>
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">++underline++</code>
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">==highlight==</code>
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">{'{{gold}}'}</code>
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">## Heading</code>
                        <code className="mx-1 bg-stone-50 px-1 py-0.5 rounded-sm">- bullet</code>. Gold and highlight
                        also work inside a heading. Click Preview to see the formatted result.
                      </span>
                    )}
                    {field.hasTitle ? (
                      <PolicyBodyEditor field={field} value={value.body} setValues={setValues} />
                    ) : (
                      <textarea
                        value={value.body}
                        onChange={(e) => setValues(prev => ({ ...prev, [field.key]: { ...fieldValue(field.key), body: e.target.value } }))}
                        placeholder={field.placeholder}
                        rows={2}
                        className="border border-stone-200 px-3 py-2.5 text-xs leading-relaxed focus:outline-none focus:border-gold-400 transition-colors"
                      />
                    )}
                  </label>

                  {/* Every Save on this page used to read the same single word, seventeen times
                      down one screen, so nothing on the button said which piece of the site it
                      belonged to. Each one now names its own section. */}
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => handleSave(field.key)}
                      disabled={saving === field.key}
                      className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                    >
                      {saving === field.key ? 'Saving…' : `Save ${field.label}`}
                    </button>
                    {overridden.has(field.key) && (
                      <button
                        onClick={() => handleReset(field.key)}
                        disabled={saving === field.key}
                        className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        Reset {field.label} to Default
                      </button>
                    )}
                    {savedMessage[field.key] && (
                      <p className="text-xs text-stone-500">{savedMessage[field.key]}</p>
                    )}
                  </div>
                </div>
              );
            })}
    </>
  );
}
