import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AffiliateInviteRequestForm from '@/components/AffiliateInviteRequestForm';
import { affiliatesEnabled, findAffiliateRequestProfile } from '@/lib/affiliates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Private invitation | Windsor Beauty', robots: { index: false, follow: false } };

export default async function AffiliateRequestPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { key } = await params;
  const { preview } = await searchParams;
  const isPreview = process.env.NODE_ENV !== 'production' && preview === '1' && key === 'a'.repeat(32);
  if (!isPreview && !affiliatesEnabled()) notFound();
  const profile = isPreview ? { display_name: 'our partner' } : await findAffiliateRequestProfile(key).catch(() => null);
  if (!profile) notFound();
  return <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold-700">Windsor Beauty</p>
    <h1 className="mt-3 font-serif text-4xl text-stone-800">A private invitation from {String(profile.display_name)}</h1>
    <p className="mt-5 text-sm leading-7 text-stone-600">If {String(profile.display_name)} shared this page with you, you can ask Windsor Beauty to email your own one-person invitation. Your link will work only with your email address and will expire after seven days.</p>
    <AffiliateInviteRequestForm requestKey={key} preview={isPreview} />
    <p className="mt-7 text-xs leading-6 text-stone-500">Requesting an invitation does not subscribe you to marketing. If you did not receive this page from {String(profile.display_name)}, you do not need to use it.</p>
  </div>;
}
