// Default copy for the Contact page (src/app/contact/page.tsx), and the shape
// of the admin-editable override stored as JSON in site_content.body for the
// 'contact' key. Mirrors aboutContent.ts.

export interface ContactSubject {
  /** Internal id used to drive conditional fields (order number) on the form. Not shown to admins. */
  value: string;
  label: string;
}

export interface ContactEmail {
  email: string;
  /** Short description shown under the address, e.g. "General enquiries". */
  label: string;
}

export interface ContactContent {
  eyebrow: string;
  heading: string;
  intro: string;
  subjects: ContactSubject[];
  emails: ContactEmail[];
}

export const DEFAULT_CONTACT_CONTENT: ContactContent = {
  eyebrow: 'Get in Touch',
  heading: 'Contact',
  intro: 'For product questions, help with an order or anything else, use the form below and our team will get back to you.',
  subjects: [
    { value: 'general', label: 'General Enquiry' },
    { value: 'order', label: 'Order Enquiry' },
    { value: 'product', label: 'Product Information' },
    { value: 'returns', label: 'Returns and Refunds' },
    { value: 'other', label: 'Other' },
  ],
  emails: [
    { email: 'info@windsorbeauty.is', label: 'General enquiries' },
    { email: 'sales@windsorbeauty.is', label: 'Sales, orders & product enquiries' },
    { email: 'beautiful@windsorbeauty.is', label: 'Customer support & brand enquiries' },
  ],
};

interface ContactContentSource {
  body?: string | null;
}

export function parseContactContent(row: ContactContentSource | null): ContactContent {
  if (!row?.body?.trim()) {
    return DEFAULT_CONTACT_CONTENT;
  }

  try {
    const parsed = JSON.parse(row.body);

    const subjects = Array.isArray(parsed.subjects)
      ? parsed.subjects
          .map((s: unknown) => {
            const entry = s as { value?: unknown; label?: unknown } | null;
            const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
            const value = typeof entry?.value === 'string' ? entry.value.trim() : '';
            return label && value ? { value, label } : null;
          })
          .filter((s: ContactSubject | null): s is ContactSubject => s !== null)
      : [];

    const emails = Array.isArray(parsed.emails)
      ? parsed.emails
          .map((e: unknown) => {
            const entry = e as { email?: unknown; label?: unknown } | null;
            const email = typeof entry?.email === 'string' ? entry.email.trim() : '';
            const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
            return email ? { email, label } : null;
          })
          .filter((e: ContactEmail | null): e is ContactEmail => e !== null)
      : [];

    return {
      eyebrow: typeof parsed.eyebrow === 'string' && parsed.eyebrow.trim() ? parsed.eyebrow : DEFAULT_CONTACT_CONTENT.eyebrow,
      heading: typeof parsed.heading === 'string' && parsed.heading.trim() ? parsed.heading : DEFAULT_CONTACT_CONTENT.heading,
      intro: typeof parsed.intro === 'string' && parsed.intro.trim() ? parsed.intro : DEFAULT_CONTACT_CONTENT.intro,
      subjects: subjects.length > 0 ? subjects : DEFAULT_CONTACT_CONTENT.subjects,
      emails: emails.length > 0 ? emails : DEFAULT_CONTACT_CONTENT.emails,
    };
  } catch {
    return DEFAULT_CONTACT_CONTENT;
  }
}

// Slugifies a subject label into a stable internal value, used when an admin
// adds a brand new dropdown option (existing options keep their original
// value so the order-number conditional fields on the form keep working).
export function slugifySubjectValue(label: string, existing: string[]): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'option';
  let candidate = base;
  let i = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}-${i}`;
    i++;
  }
  return candidate;
}
