import { notFound } from 'next/navigation';
import PaypalDemoJourney from '@/components/PaypalDemoJourney';
import { buildPaypalLink } from '@/lib/paypalInstructionsEmail';

interface PaypalDemoPageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function PaypalDemoPage({ searchParams }: PaypalDemoPageProps) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { view } = await searchParams;
  return <PaypalDemoJourney paymentUrl={buildPaypalLink('WB-DEMO', 62.10)} initiallyConfirmed={view === 'ready'} />;
}
