export default function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal mb-3">{title}</h1>
        {updated && <p className="text-xs text-brand-stone mb-10">Last updated: {updated}</p>}
        <div
          className="space-y-5 text-sm text-brand-stone leading-relaxed
            [&_h2]:font-display [&_h2]:text-2xl [&_h2]:text-brand-charcoal [&_h2]:pt-5 [&_h2]:mb-1
            [&_ul]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5
            [&_strong]:text-brand-charcoal [&_strong]:font-medium
            [&_a]:text-brand-champagne-dark [&_a]:underline [&_a]:underline-offset-2"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
