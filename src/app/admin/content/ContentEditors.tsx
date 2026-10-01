'use client';

import { memo, useCallback, type Dispatch, type SetStateAction } from 'react';
import MarkdownLiteEditor from '@/components/admin/MarkdownLiteEditor';
import type { AboutContent } from '@/lib/aboutContent';
import { getFieldDefault, type ContentField, type SetValuesFn } from './contentFields';

// Moved out of page.tsx unchanged: the three memo-isolated editors that keep a
// keystroke in one long field from re-rendering the whole page.

// onChange callback whose identity never changes across re-renders of the
// parent page (deps are `field` — a stable reference from the module-level
// CONTENT_FIELDS array — and the useState setter, which React guarantees is
// stable). Renders the lite-markdown textarea editor (see the 2026-06-21
// audit for why the previous contentEditable-based editor was replaced for
// these long-form fields specifically).
export const PolicyBodyEditor = memo(function PolicyBodyEditor({
  field,
  value,
  setValues,
}: {
  field: ContentField;
  value: string;
  setValues: SetValuesFn;
}) {
  const onChange = useCallback((text: string) => {
    setValues(prev => ({
      ...prev,
      [field.key]: { ...(prev[field.key] ?? getFieldDefault(field)), body: text },
    }));
  }, [field, setValues]);

  return <MarkdownLiteEditor value={value} onChange={onChange} placeholder={field.placeholder} height="340px" />;
});

export type SetAboutFn = Dispatch<SetStateAction<AboutContent>>;

// Same isolation pattern as PolicyBodyEditor, for the About page's
// paragraph/value editors (smaller in number, but kept consistent so every
// content field behaves the same way).
export const AboutParagraphEditor = memo(function AboutParagraphEditor({
  index,
  value,
  setAbout,
}: {
  index: number;
  value: string;
  setAbout: SetAboutFn;
}) {
  const onChange = useCallback((text: string) => {
    setAbout(prev => {
      const next = [...prev.paragraphs];
      next[index] = text;
      return { ...prev, paragraphs: next };
    });
  }, [index, setAbout]);

  return <MarkdownLiteEditor value={value} onChange={onChange} height="120px" />;
});

export const AboutValueDescEditor = memo(function AboutValueDescEditor({
  index,
  value,
  setAbout,
}: {
  index: number;
  value: string;
  setAbout: SetAboutFn;
}) {
  const onChange = useCallback((text: string) => {
    setAbout(prev => {
      const next = [...prev.values];
      next[index] = { ...next[index], desc: text };
      return { ...prev, values: next };
    });
  }, [index, setAbout]);

  return <MarkdownLiteEditor value={value} onChange={onChange} placeholder="Description" height="100px" />;
});
