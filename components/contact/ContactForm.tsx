"use client";

import { useState, type FormEvent } from "react";

const inputClasses =
  "w-full border border-brand-line bg-white px-4 py-3 text-sm text-brand-charcoal placeholder:text-brand-stone focus:outline-none focus:border-brand-champagne transition-colors";

const labelClasses = "block text-[10px] tracking-widest uppercase text-brand-charcoal mb-2";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="border border-brand-line p-6 sm:p-8">
        <p className="font-display text-2xl text-brand-charcoal">Thank you.</p>
        <p className="mt-2 text-sm text-brand-stone leading-relaxed">
          Your message has been received. We will get back to you as soon as possible.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClasses}>Name</label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClasses}
          placeholder="Your name"
        />
      </div>
      <div>
        <label htmlFor="email" className={labelClasses}>Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClasses}
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="message" className={labelClasses}>Message</label>
        <textarea
          id="message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputClasses}
          placeholder="How can we help?"
        />
      </div>
      <button
        type="submit"
        className="w-full sm:w-auto bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
      >
        Send Message
      </button>
    </form>
  );
}
