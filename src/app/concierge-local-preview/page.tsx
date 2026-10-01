import { notFound } from 'next/navigation';
import BackToHome from '@/components/BackToHome';
import ConciergeModes from '@/components/account/ConciergeModes';

// Visual review route for local development only. Production always returns a
// normal 404, so this page cannot bypass the member gate on the live website.
export const dynamic = 'force-dynamic';

export default function ConciergeLocalPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <BackToHome />
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6">
        <div className="mx-auto mb-7 mt-6 max-w-3xl text-center">
          <p className="mb-1 text-[9px] uppercase tracking-[0.38em] text-gold-700">Windsor Glow</p>
          <h1 className="inline-block border-b border-gold-400 pb-3 font-serif text-4xl tracking-wide text-stone-800">
            AI Assistance
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-stone-500">
            Choose Concierge for orders and website help, or open PEARL to explore compounds,
            categories and the evidence supplied with them.
          </p>
        </div>
        <ConciergeModes firstName="Kieran" />
      </div>
    </>
  );
}
