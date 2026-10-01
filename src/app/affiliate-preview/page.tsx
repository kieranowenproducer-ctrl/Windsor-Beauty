import { notFound } from 'next/navigation';
import { AffiliateDashboard } from '@/app/account/affiliate/page';

export default function AffiliatePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <AffiliateDashboard forcePreview />;
}
