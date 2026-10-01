import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'How Windsor Beauty packs, dispatches and delivers skincare orders, with delivery '
  + 'options, costs and what to do if a parcel is late or damaged.';

export const metadata: Metadata = {
  title: 'Shipping Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/shipping` },
};

// The delivery windows, prices and carrier names below must match `src/lib/shippingWindows.ts`.
// `npm run check:shipping` reads this file and fails if they drift.
export default function ShippingPolicyPage() {
  return (
    <PolicyPage
      contentKey="shipping-policy"
      title="Shipping Policy"
      intro="An overview of how we pack, dispatch and deliver orders, and what to expect once you have checked out."
    >
      <PolicySection heading="Processing Times">
        <p>
          Orders are typically processed and dispatched within one to two working days of payment being confirmed.
          Orders placed on weekends or UK public holidays are processed on the next working day. During exceptionally
          busy periods, processing may take slightly longer. If so, we will let you know.
        </p>
      </PolicySection>

      <PolicySection heading="Delivery Options and Timeframes">
        <p>We currently offer two delivery options at checkout:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li><span className="text-stone-600 font-medium">UK Delivery</span> (Royal Mail Tracked) for £10, typically 2 to 4 working days from dispatch.</li>
          <li><span className="text-stone-600 font-medium">International Delivery</span> (Royal Mail International Tracked) for £40, typically 7 to 14 working days from dispatch, depending on destination and customs processes.</li>
        </ul>
        <p>
          These timeframes are estimates and are not guaranteed. Factors outside our control, including customs
          checks, courier delays and severe weather, can occasionally extend delivery times.
        </p>
      </PolicySection>

      <PolicySection heading="Shipping Costs">
        <p>
          Shipping is charged at a flat rate of £10 for UK delivery and £40 for international delivery, shown in
          your basket and confirmed again at checkout before you complete your order.
        </p>
      </PolicySection>

      <PolicySection heading="Packaging">
        <p>
          All orders are packed carefully to protect the contents in transit. If you have any specific delivery
          instructions, please get in touch before placing your order and we will do our best to help.
        </p>
      </PolicySection>

      <PolicySection heading="Tracking Your Order">
        <p>
          Once your order has been dispatched, we will send a confirmation email containing your tracking information
          where available. You can also check the status of your order at any time from your account.
        </p>
      </PolicySection>

      <PolicySection heading="International Orders">
        <p>
          For deliveries outside the United Kingdom, your order may be subject to import duties, taxes or customs
          charges set by the destination country. These charges are the responsibility of the recipient and are not
          included in our shipping costs or product prices. We recommend checking with your local customs office
          before placing an international order.
        </p>
      </PolicySection>

      <PolicySection heading="Issues With Delivery">
        <p>
          If your order has not arrived within the expected timeframe, or arrives damaged, please contact our support
          team with your order number as soon as possible so that we can look into it and put things right.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
