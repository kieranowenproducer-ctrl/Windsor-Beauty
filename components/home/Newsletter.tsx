"use client";

import { useState, type FormEvent } from "react";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
    setEmail("");
  }

  return (
    <div className="mx-auto max-w-xl text-center">
      <h2 className="font-display text-3xl sm:text-4xl text-brand-charcoal">Join the list</h2>
      <p className="mt-3 text-sm text-brand-stone leading-relaxed">
        Skincare tips, new arrivals and routine guides, sent occasionally and never shared.
      </p>

      {submitted ? (
        <p className="mt-6 text-sm text-brand-champagne-dark">
          Thank you, you&rsquo;re on the list.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-0">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email address"
            className="flex-1 border border-brand-line bg-white px-4 py-3 text-sm text-brand-charcoal placeholder:text-brand-stone focus:outline-none focus:border-brand-champagne sm:border-r-0"
          />
          <button
            type="submit"
            className="bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-6 py-3 hover:bg-brand-champagne-dark transition-colors"
          >
            Subscribe
          </button>
        </form>
      )}
    </div>
  );
}
