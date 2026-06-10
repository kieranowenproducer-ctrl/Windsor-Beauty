"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, ShoppingBag, X } from "lucide-react";
import Logo from "@/components/Logo";
import { useCart } from "@/lib/cart";

const NAV_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "Serums", href: "/shop?category=Serums" },
  { label: "Women's", href: "/shop?category=Women%27s" },
  { label: "Men's", href: "/shop?category=Men%27s" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const { itemCount } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-brand-cream/90 backdrop-blur-sm border-b border-brand-line">
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between">
        <Logo />

        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-[11px] tracking-widest uppercase text-brand-charcoal hover:text-brand-champagne-dark transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/cart" className="relative p-2 -mr-2" aria-label="View basket">
            <ShoppingBag className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-champagne text-[9px] font-medium text-brand-charcoal">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            className="md:hidden p-2"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? (
              <X className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
            ) : (
              <Menu className="h-5 w-5 text-brand-charcoal" strokeWidth={1.5} />
            )}
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-brand-line bg-brand-cream px-4 py-4 flex flex-col gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-[11px] tracking-widest uppercase text-brand-charcoal"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
