import { sanitizeRichTextHtml } from '@/lib/richText';

interface RichTextContentProps {
  html: string;
  className?: string;
}

// Renders admin-authored rich text (Terms & Conditions, policy pages, product
// descriptions) on the public site. Sanitizes again at render time as a
// defence-in-depth measure — content is also sanitized before it's saved.
export default function RichTextContent({ html, className = '' }: RichTextContentProps) {
  const safeHtml = sanitizeRichTextHtml(html);

  return (
    <div
      className={`rich-text-content ${className}`}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
