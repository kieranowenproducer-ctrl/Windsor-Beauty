import Image from 'next/image';
import BackToHome from '@/components/BackToHome';
import RichTextContent from '@/components/RichTextContent';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { parseAboutContent } from '@/lib/aboutContent';
import { markdownLiteToHtml } from '@/lib/markdownLite';

export default async function AboutPage() {
  const row = isDbConfigured() ? await getSiteContent('about').catch(() => null) : null;
  const content = parseAboutContent(row);
  const toHtml = (field: string) => (content.format === 'html' ? field : markdownLiteToHtml(field));

  return (
    <>
      <BackToHome />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-20">

      {/* Header */}
      <div className="text-center mb-16">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">{content.eyebrow}</p>
        <h1 className="font-serif text-5xl text-stone-800 tracking-wide mb-5">
          {content.heading}
        </h1>
        <div className="flex items-center justify-center gap-5">
          <div className="h-px flex-1 max-w-20 bg-gold-200" />
          <span className="text-[8px] tracking-[0.32em] uppercase text-gold-700">
            {content.tagline}
          </span>
          <div className="h-px flex-1 max-w-20 bg-gold-200" />
        </div>
      </div>

      {/* Image */}
      {content.imageUrl && (
        <div className="relative w-full aspect-[16/9] mb-16 border border-gold-100">
          <Image
            src={content.imageUrl}
            alt={content.heading}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>
      )}

      {/* Body text */}
      <div className="space-y-6 mb-16">
        {content.paragraphs.map((paragraph, i) => (
          <RichTextContent key={i} html={toHtml(paragraph)} className="text-sm text-stone-500 leading-relaxed" />
        ))}
      </div>

      {/* Values */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-16">
        {content.values.map(({ label, desc }, i) => (
          <div key={i} className="border-t-2 border-gold-300 pt-5">
            <h3 className="font-serif text-xl text-gold-700 mb-2">{label}</h3>
            <RichTextContent html={toHtml(desc)} className="text-xs text-stone-500 leading-relaxed" />
          </div>
        ))}
      </div>

      {/* Group info */}
      <div className="border border-gold-100 bg-gold-50/30 p-8 text-center">
        <p className="text-[9px] tracking-[0.28em] uppercase text-gold-700 mb-2">{content.groupEyebrow}</p>
        <p className="font-serif text-2xl text-gold-700 font-semibold">
          {content.groupHeading}
        </p>
        <RichTextContent html={toHtml(content.groupBody)} className="mt-4 text-xs text-stone-500 leading-relaxed max-w-sm mx-auto" />
      </div>
      </div>
    </>
  );
}
