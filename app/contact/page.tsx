import type { Metadata } from "next";
import { Clock, Mail, MapPin } from "lucide-react";
import ContactForm from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Windsor Beauty team.",
};

export default function ContactPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <div className="max-w-2xl">
        <p className="text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark mb-2">Get in Touch</p>
        <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal">Contact Us</h1>
        <p className="mt-3 text-sm text-brand-stone leading-relaxed">
          Questions about an order, a product, or your skincare routine? Send us a
          message and we will get back to you.
        </p>
      </div>

      <div className="mt-12 grid lg:grid-cols-2 gap-10 lg:gap-16">
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-sand shrink-0">
              <Mail className="h-5 w-5 text-brand-champagne-dark" strokeWidth={1.5} />
            </span>
            <div>
              <h3 className="font-display text-xl text-brand-charcoal">Email</h3>
              <p className="mt-1 text-sm text-brand-stone">hello@windsorbeauty.co.uk</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-sand shrink-0">
              <Clock className="h-5 w-5 text-brand-champagne-dark" strokeWidth={1.5} />
            </span>
            <div>
              <h3 className="font-display text-xl text-brand-charcoal">Response Times</h3>
              <p className="mt-1 text-sm text-brand-stone leading-relaxed">
                We aim to reply within one to two working days, Monday to Friday.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-sand shrink-0">
              <MapPin className="h-5 w-5 text-brand-champagne-dark" strokeWidth={1.5} />
            </span>
            <div>
              <h3 className="font-display text-xl text-brand-charcoal">Based In</h3>
              <p className="mt-1 text-sm text-brand-stone">London, United Kingdom</p>
            </div>
          </div>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
