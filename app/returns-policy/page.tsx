import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Returns Policy",
  description: "How to return or exchange items purchased from Windsor Beauty within 30 days.",
};

export default function ReturnsPolicyPage() {
  return (
    <LegalLayout title="Returns Policy" updated="June 2026">
      <p>
        We want you to be happy with your order. If something is not right, you can
        return it to us within 30 days of delivery.
      </p>

      <h2>Eligibility</h2>
      <ul>
        <li>Items must be returned within 30 days of the delivery date</li>
        <li>Items must be unused, unopened and in their original packaging</li>
        <li>For hygiene reasons, opened skincare items cannot be returned unless faulty</li>
        <li>Proof of purchase, such as your order number, is required</li>
      </ul>

      <h2>How to Start a Return</h2>
      <p>
        Contact us via our <a href="/contact">contact page</a> with your order number
        and the item you would like to return. We will confirm the return address and
        next steps by email.
      </p>

      <h2>Refunds</h2>
      <p>
        Once we receive and inspect your return, we will let you know whether it has
        been approved. Approved refunds are issued to your original payment method
        and may take a few working days to appear, depending on your bank or card
        provider.
      </p>

      <h2>Faulty or Damaged Items</h2>
      <p>
        If an item arrives faulty or damaged, please contact us as soon as possible
        with a photo and your order number. We will arrange a replacement or refund
        at no extra cost to you.
      </p>

      <h2>Return Postage</h2>
      <p>
        Unless an item is faulty or incorrect, return postage costs are the
        responsibility of the customer. We recommend using a tracked service, as we
        cannot take responsibility for items lost in transit.
      </p>
    </LegalLayout>
  );
}
