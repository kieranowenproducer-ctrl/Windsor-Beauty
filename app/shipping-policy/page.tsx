import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Delivery times, costs and dispatch information for Windsor Beauty orders.",
};

export default function ShippingPolicyPage() {
  return (
    <LegalLayout title="Shipping Policy" updated="June 2026">
      <p>
        We despatch every order from our team in the UK and aim to get your skincare to
        you as quickly as possible.
      </p>

      <h2>Delivery Costs</h2>
      <p>
        Standard UK delivery costs <strong>£3.95</strong>. Orders over <strong>£35</strong> qualify
        for free standard UK delivery automatically at checkout.
      </p>

      <h2>Despatch Times</h2>
      <p>
        Orders placed before 2pm on a working day are usually despatched the same day.
        Orders placed after 2pm, or on a weekend or bank holiday, are despatched the
        next working day.
      </p>

      <h2>Delivery Times</h2>
      <ul>
        <li>Standard UK delivery: 2 to 4 working days from despatch</li>
        <li>Orders are sent via Royal Mail or a comparable tracked courier</li>
        <li>A confirmation email with tracking details is sent once your order is despatched</li>
      </ul>

      <h2>Delivery Address</h2>
      <p>
        Please double check your delivery address and postcode at checkout. We are
        unable to redirect parcels once they have been despatched, so let us know
        as soon as possible if you spot an error.
      </p>

      <h2>International Delivery</h2>
      <p>
        At present we only deliver within the United Kingdom. If this changes, this
        page will be updated with international rates and timeframes.
      </p>

      <h2>Questions</h2>
      <p>
        If your order has not arrived within the expected timeframe, please get in
        touch via our <a href="/contact">contact page</a> and we will look into it for you.
      </p>
    </LegalLayout>
  );
}
