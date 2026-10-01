import { Suspense } from 'react';
import type { Metadata } from 'next';
import PearlControlCentre from '@/components/admin/pearl/PearlControlCentre';

export const metadata: Metadata = { title: 'PEARL Dashboard | Windsor Glow Admin' };

export default function ImprovePearlPage() {
  return (
    <Suspense fallback={<main className="flex-1 p-6 text-sm text-stone-500 lg:p-8">Loading the PEARL Dashboard...</main>}>
      <PearlControlCentre />
    </Suspense>
  );
}
