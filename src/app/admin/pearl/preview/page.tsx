import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import PearlControlCentre from '@/components/admin/pearl/PearlControlCentre';

export const metadata = { title: 'PEARL Dashboard Preview' };

export default function PearlPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return (
    <Suspense fallback={<main className="flex-1 p-6 text-sm text-stone-500 lg:p-8">Loading the PEARL Dashboard...</main>}>
      <PearlControlCentre previewMode />
    </Suspense>
  );
}
