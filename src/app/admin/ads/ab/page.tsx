import { redirect } from 'next/navigation';

// The old "A and B" address. The page became Compare on 4 Sept 2026, once
// Kieran said two was not enough; anything pointing here lands there.
export default function AbPage() {
  redirect('/admin/ads/compare');
}
