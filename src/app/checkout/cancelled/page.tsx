import Link from 'next/link';

export default function CheckoutCancelledPage() {
  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-stone-200 flex items-center justify-center mx-auto mb-8">
        <svg className="w-7 h-7 text-stone-500" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 18L18 6M6 6l12 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <p className="text-[9px] tracking-[0.38em] uppercase text-stone-500 mb-3">
        Payment Cancelled
      </p>
      <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">
        Order Not Completed
      </h1>
      <p className="text-sm text-stone-500 leading-relaxed mb-10 max-w-sm mx-auto">
        Your payment was cancelled. No charges have been made. Your basket is still saved if you would like to try again.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/checkout"
          className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors"
        >
          Return to Checkout
        </Link>
        <Link
          href="/shop"
          className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
        >
          Browse Products
        </Link>
      </div>

      <p className="mt-8 text-xs text-stone-500">
        Need help?{' '}
        <Link href="/contact" className="text-gold-700 hover:underline">
          Contact Support
        </Link>
      </p>
    </div>
  );
}
