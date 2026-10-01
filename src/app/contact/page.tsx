import BackToHome from '@/components/BackToHome';
import ContactForm from '@/components/ContactForm';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { parseContactContent } from '@/lib/contactContent';

export default async function ContactPage() {
  const row = isDbConfigured() ? await getSiteContent('contact').catch(() => null) : null;
  const content = parseContactContent(row);

  return (
    <>
      <BackToHome />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-20">

      <div className="text-center mb-14">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">{content.eyebrow}</p>
        <h1 className="font-serif text-5xl text-stone-800 tracking-wide mb-4">{content.heading}</h1>
        <p className="text-sm text-stone-500 max-w-md mx-auto leading-relaxed">
          {content.intro}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">

        {/* Contact details */}
        <div className="space-y-8">
          <div>
            <h3 className="text-[9px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-3">
              Email
            </h3>
            <div className="space-y-3.5">
              {content.emails.map((entry) => (
                <div key={entry.email}>
                  <a href={`mailto:${entry.email}`} className="text-sm text-stone-600 hover:text-gold-800 transition-colors">
                    {entry.email}
                  </a>
                  {entry.label && <p className="text-[10px] text-stone-500 mt-0.5">{entry.label}</p>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[9px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-2">
              Company
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              Windsor Beauty<br />
              Part of the C&S Holdings Group<br />
              United Kingdom
            </p>
          </div>

          <div>
            <h3 className="text-[9px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-2">
              Getting in Touch
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              We aim to respond to all enquiries as quickly as possible.
            </p>
          </div>

          <div className="border-t border-gold-100 pt-6">
            <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-2">
              Product Advice
            </p>
            <p className="text-xs text-stone-500 leading-relaxed">
              Our products are cosmetics for external use only. We cannot give medical advice. If you have a skin condition, please speak to a pharmacist or doctor.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="md:col-span-2">
          <ContactForm subjects={content.subjects} />
        </div>
      </div>
      </div>
    </>
  );
}
