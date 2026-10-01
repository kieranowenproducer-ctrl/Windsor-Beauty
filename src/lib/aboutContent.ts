// Default copy for the About page (src/app/about/page.tsx), and the shape of
// the admin-editable override stored as JSON in site_content.body for the
// 'about' key (image lives in site_content.image_url). Mirrors the pattern
// in policyDefaults.ts but structured, since the About page keeps its
// existing layout rather than collapsing to plain paragraphs.

export interface AboutValue {
  label: string;
  desc: string;
}

export interface AboutContent {
  eyebrow: string;
  heading: string;
  tagline: string;
  /** Rich text — see `format` for which syntax. Render via RichTextContent (HTML directly, or markdownLiteToHtml(...) first). */
  paragraphs: string[];
  /** `desc` is rich text — see `format`. Render via RichTextContent (HTML directly, or markdownLiteToHtml(...) first). */
  values: AboutValue[];
  groupEyebrow: string;
  groupHeading: string;
  /** Rich text — see `format`. Render via RichTextContent (HTML directly, or markdownLiteToHtml(...) first). */
  groupBody: string;
  imageUrl: string | null;
  /** Storage format shared by paragraphs/values[].desc/groupBody. 'html' = legacy Tiptap-saved markup (and any row saved before this flag existed), rendered as-is. 'markdown' = lite-markdown source text (src/lib/markdownLite.ts), rendered via markdownLiteToHtml(). */
  format: 'html' | 'markdown';
}

export const DEFAULT_ABOUT_CONTENT: AboutContent = {
  eyebrow: 'Our Story',
  heading: 'About Windsor Glow',
  tagline: 'Regenerate • Renew • Revitalise',
  paragraphs: [
    'Windsor Glow is a premium supplier of high-purity research peptides and compounds, operating as part of the C&S Holdings Group. We are committed to providing the scientific community with the highest quality research materials, supported by comprehensive quality assurance and full documentation.',
    'All products supplied by Windsor Glow are manufactured to the highest standards, independently tested for purity, and accompanied by a full certificate of analysis. Our catalogue covers a range of research compounds including GLP-1 receptor agonists, peptide complexes, growth hormone peptides, and other advanced research materials.',
    'We are dedicated to the responsible supply of research materials. Every product in our catalogue is supplied strictly for laboratory and in vitro research purposes. We do not make any therapeutic, diagnostic, or medical claims regarding our products.',
  ],
  values: [
    { label: 'Purity', desc: 'Every product independently verified to 99% purity. Full certificate of analysis included with every order.' },
    { label: 'Integrity', desc: 'Transparent sourcing, honest product documentation, and responsible supply practices throughout.' },
    { label: 'Precision', desc: 'Accurate labelling, verified dosages, and consistent quality maintained across every production batch.' },
  ],
  groupEyebrow: 'Part of',
  groupHeading: 'C&S Holdings Group',
  groupBody: 'Windsor Glow operates under the C&S Holdings Group, ensuring high standards of corporate governance, compliance, and operational excellence across all supply activities.',
  imageUrl: null,
  format: 'markdown',
};

interface AboutContentSource {
  body?: string | null;
  image_url?: string | null;
}

export function parseAboutContent(row: AboutContentSource | null): AboutContent {
  const imageUrl = row?.image_url || null;

  if (!row?.body?.trim()) {
    return { ...DEFAULT_ABOUT_CONTENT, imageUrl };
  }

  try {
    const parsed = JSON.parse(row.body);
    // Anything other than exactly 'html' (including rows saved before this
    // flag existed, which were always plain text) is treated as lite-markdown
    // source — plain prose is valid lite-markdown as typed, no conversion
    // needed at parse time.
    const format: AboutContent['format'] = parsed.format === 'html' ? 'html' : 'markdown';

    const rawParagraphs = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
      : [];
    const paragraphs = rawParagraphs.length > 0 ? rawParagraphs : DEFAULT_ABOUT_CONTENT.paragraphs;

    const values = Array.isArray(parsed.values) && parsed.values.length > 0
      ? parsed.values.map((v: unknown, i: number) => {
          const fallback = DEFAULT_ABOUT_CONTENT.values[i] ?? { label: '', desc: '' };
          const entry = v as { label?: unknown; desc?: unknown } | null;
          return {
            label: typeof entry?.label === 'string' && entry.label.trim() ? entry.label : fallback.label,
            desc: typeof entry?.desc === 'string' && entry.desc.trim() ? entry.desc : fallback.desc,
          };
        })
      : DEFAULT_ABOUT_CONTENT.values;

    return {
      eyebrow: typeof parsed.eyebrow === 'string' && parsed.eyebrow.trim() ? parsed.eyebrow : DEFAULT_ABOUT_CONTENT.eyebrow,
      heading: typeof parsed.heading === 'string' && parsed.heading.trim() ? parsed.heading : DEFAULT_ABOUT_CONTENT.heading,
      tagline: typeof parsed.tagline === 'string' && parsed.tagline.trim() ? parsed.tagline : DEFAULT_ABOUT_CONTENT.tagline,
      paragraphs,
      values,
      groupEyebrow: typeof parsed.groupEyebrow === 'string' && parsed.groupEyebrow.trim() ? parsed.groupEyebrow : DEFAULT_ABOUT_CONTENT.groupEyebrow,
      groupHeading: typeof parsed.groupHeading === 'string' && parsed.groupHeading.trim() ? parsed.groupHeading : DEFAULT_ABOUT_CONTENT.groupHeading,
      groupBody: typeof parsed.groupBody === 'string' && parsed.groupBody.trim() ? parsed.groupBody : DEFAULT_ABOUT_CONTENT.groupBody,
      imageUrl,
      format,
    };
  } catch {
    return { ...DEFAULT_ABOUT_CONTENT, imageUrl };
  }
}
