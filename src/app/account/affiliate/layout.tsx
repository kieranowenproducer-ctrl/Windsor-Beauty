import { notFound } from 'next/navigation';
import { affiliatesEnabled } from '@/lib/affiliates';

export default function AffiliateAccountLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!affiliatesEnabled()) notFound();
  return children;
}
