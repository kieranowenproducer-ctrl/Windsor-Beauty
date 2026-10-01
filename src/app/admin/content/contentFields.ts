import type { Dispatch, SetStateAction } from 'react';
import { POLICY_DEFAULTS } from '@/lib/policyDefaults';

// Moved out of page.tsx unchanged: the list of editable content fields and the
// small helpers around it. Only the word `export` was added.

export interface ContentField {
  key: string;
  label: string;
  description: string;
  hasTitle: boolean;
  placeholder: string;
}

export const CONTENT_FIELDS: ContentField[] = [
  {
    key: 'announcement-bar',
    label: 'Announcement Bar',
    description: 'Scrolling ticker text shown across the top of every page, beneath the header. Leave empty to use the default text.',
    hasTitle: false,
    placeholder: 'For Research Use Only  •  Not for Human Consumption  •  18+ Only  •  99% Purity  •  Lab Tested  •  Certificate of Analysis Included  •',
  },
  {
    key: 'terms',
    label: 'Terms and Conditions',
    description: 'Replaces the content of the Terms and Conditions page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Terms and Conditions text...',
  },
  {
    key: 'privacy',
    label: 'Privacy Policy',
    description: 'Replaces the content of the Privacy Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Privacy Policy text...',
  },
  {
    key: 'shipping-policy',
    label: 'Shipping Policy',
    description: 'Replaces the content of the Shipping Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Shipping Policy text...',
  },
  {
    key: 'returns-policy',
    label: 'Returns Policy',
    description: 'Replaces the content of the Returns Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Returns Policy text...',
  },
  {
    key: 'refund-policy',
    label: 'Refund Policy',
    description: 'Replaces the content of the Refund Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Refund Policy text...',
  },
  {
    key: 'cookies',
    label: 'Cookie Policy',
    description: 'Replaces the content of the Cookie Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Cookie Policy text...',
  },
  {
    key: 'disclaimer',
    label: 'Product Disclaimer',
    description: 'Replaces the content of the Product Disclaimer page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Product Disclaimer text...',
  },
  {
    key: 'research-disclaimer',
    label: 'Research Use Disclaimer',
    description: 'Replaces the content of the Research Use Disclaimer page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Research Use Disclaimer text...',
  },
  {
    key: 'age-restriction',
    label: 'Age Restriction & Access Policy',
    description: 'Replaces the content of the Age Restriction & Access Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Age Restriction & Access Policy text...',
  },
  {
    key: 'payment-policy',
    label: 'Payment Policy',
    description: 'Replaces the content of the Payment Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Payment Policy text...',
  },
  {
    key: 'contact-policy',
    label: 'Contact Policy',
    description: 'Replaces the content of the Contact Policy page. Leave empty to use the default page content.',
    hasTitle: true,
    placeholder: 'Enter the full Contact Policy text...',
  },
];

export interface ContentRow {
  key: string;
  title: string | null;
  body: string;
  image_url: string | null;
  format: string;
}

export type ValuesMap = Record<string, { title: string; body: string }>;
export type SetValuesFn = Dispatch<SetStateAction<ValuesMap>>;

// Pure function of `field` + the static POLICY_DEFAULTS map — safe to call
// from inside a stable useCallback without needing `values` state as a
// dependency (see PolicyBodyEditor below). Defaults are plain text, which is
// already valid lite-markdown as-is — no conversion needed (the old HTML
// conversion here was only for the previous Tiptap editor).
export function getFieldDefault(field: ContentField): { title: string; body: string } {
  return POLICY_DEFAULTS[field.key] ?? { title: '', body: '' };
}

// Isolates the editor for one policy field behind React.memo, with an
