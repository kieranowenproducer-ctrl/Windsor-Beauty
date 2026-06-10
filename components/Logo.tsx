import Link from "next/link";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex flex-col leading-none group ${className}`}>
      <span className="font-display text-2xl sm:text-[26px] tracking-wide text-brand-charcoal group-hover:text-brand-champagne-dark transition-colors">
        Windsor Beauty
      </span>
      <span className="text-[9px] tracking-ultra-wide uppercase text-brand-stone mt-1">
        Skincare &middot; London
      </span>
    </Link>
  );
}
