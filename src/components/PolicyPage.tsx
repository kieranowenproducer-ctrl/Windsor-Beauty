import { getSiteContent, isDbConfigured } from '@/lib/db';
import { markdownLiteToHtml } from '@/lib/markdownLite';
import PolicyLayout from './PolicyLayout';
import RichTextContent from './RichTextContent';

interface PolicyPageProps {
  contentKey: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}

export default async function PolicyPage({ contentKey, title, intro, children }: PolicyPageProps) {
  const content = isDbConfigured() ? await getSiteContent(contentKey).catch(() => null) : null;

  if (content?.body?.trim()) {
    if (content.format === 'html') {
      return (
        <PolicyLayout title={content.title?.trim() || title} intro={intro}>
          <RichTextContent html={content.body} className="text-sm text-stone-500 leading-relaxed" />
        </PolicyLayout>
      );
    }

    if (content.format === 'markdown') {
      return (
        <PolicyLayout title={content.title?.trim() || title} intro={intro}>
          <RichTextContent html={markdownLiteToHtml(content.body)} className="text-sm text-stone-500 leading-relaxed" />
        </PolicyLayout>
      );
    }

    const paragraphs = content.body.trim().split(/\n\s*\n/);
    return (
      <PolicyLayout title={content.title?.trim() || title} intro={intro}>
        <div className="text-sm text-stone-500 leading-relaxed space-y-4">
          {paragraphs.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </PolicyLayout>
    );
  }

  return <PolicyLayout title={title} intro={intro}>{children}</PolicyLayout>;
}
