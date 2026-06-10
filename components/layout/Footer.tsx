import Link from "next/link";
import { Lock, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import Logo from "@/components/Logo";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/orders";
import { formatPriceShort } from "@/lib/products";

const TRUST_STRIP = [
  { icon: Truck, label: `Free standard delivery over ${formatPriceShort(FREE_SHIPPING_THRESHOLD)}` },
  { icon: ShieldCheck, label: "Patch tested formulas" },
  { icon: RotateCcw, label: "30-day returns" },
  { icon: Lock, label: "Secure checkout" },
];

const FOOTER_LINKS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { label: "Serums", href: "/shop?category=Serums" },
      { label: "Moisturisers", href: "/shop?category=Moisturisers" },
      { label: "Cleansers", href: "/shop?category=Cleansers" },
      { label: "Men's Skincare", href: "/shop?category=Men%27s" },
      { label: "SPF", href: "/shop?category=SPF" },
      { label: "Extras", href: "/shop?category=Extras" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Shipping Policy", href: "/shipping-policy" },
      { label: "Returns Policy", href: "/returns-policy" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-brand-line bg-brand-sand/60">
      <div className="border-b border-brand-line">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4">
            {TRUST_STRIP.map((item) => (
              <div key={item.label} className="flex items-center gap-3 justify-center text-center sm:text-left sm:justify-start">
                <item.icon className="h-5 w-5 text-brand-champagne-dark shrink-0" strokeWidth={1.5} />
                <span className="text-xs text-brand-charcoal">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2">
            <Logo />
            <p className="mt-4 text-sm text-brand-stone leading-relaxed max-w-xs">
              Considered skincare essentials for everyday routines. Designed in London,
              suitable for most skin types.
            </p>
          </div>

          {FOOTER_LINKS.map((col) => (
            <div key={col.heading}>
              <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-4">{col.heading}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-brand-stone hover:text-brand-champagne-dark transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-brand-line flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-brand-stone">
            &copy; {new Date().getFullYear()} Windsor Beauty. All rights reserved.
          </p>
          <p className="text-xs text-brand-stone">Patch test before first use.</p>
        </div>
      </div>
    </footer>
  );
}
