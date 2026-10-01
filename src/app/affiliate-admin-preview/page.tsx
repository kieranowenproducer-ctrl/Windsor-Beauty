import { notFound } from 'next/navigation';
import { AdminAffiliates } from '@/app/admin/affiliates/page';

export default function AffiliateAdminPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <AdminAffiliates forcePreview />;
}
