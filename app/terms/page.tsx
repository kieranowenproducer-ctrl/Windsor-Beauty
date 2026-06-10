import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms and conditions for using the Windsor Beauty website and placing an order.",
};

export default function TermsPage() {
  return (
    <LegalLayout title="Terms & Conditions" updated="June 2026">
      <p>
        These terms apply whenever you use the Windsor Beauty website or place an
        order with us. By using this site, you agree to these terms.
      </p>

      <h2>Products</h2>
      <p>
        We try to make sure product descriptions, images and pricing are accurate.
        Colours and packaging may vary slightly from any images shown. We may update
        or discontinue products at any time.
      </p>

      <h2>Pricing and Payment</h2>
      <p>
        All prices are shown in pounds sterling (GBP) and include VAT where
        applicable. We reserve the right to correct pricing errors. Payment is taken
        in full once payment processing is enabled at checkout.
      </p>

      <h2>Orders</h2>
      <p>
        When you place an order, you will receive an order confirmation. This
        confirms we have received your order, and a further email will follow once
        payment has been processed and your order is despatched.
      </p>

      <h2>Skincare Use</h2>
      <p>
        Our products are designed for general skincare routines and are suitable
        for most skin types. As with any new skincare product, we recommend
        carrying out a patch test before first use. If irritation occurs, stop use
        and consult a pharmacist or doctor.
      </p>

      <h2>Returns</h2>
      <p>
        Please see our <a href="/returns-policy">Returns Policy</a> for full details
        on returning an item.
      </p>

      <h2>Liability</h2>
      <p>
        We are not liable for any indirect or consequential loss arising from the
        use of our products or website. Nothing in these terms limits any rights
        you have as a consumer under UK law.
      </p>

      <h2>Governing Law</h2>
      <p>
        These terms are governed by the laws of England and Wales.
      </p>

      <h2>Contact</h2>
      <p>
        Any questions about these terms can be sent via our{" "}
        <a href="/contact">contact page</a>.
      </p>
    </LegalLayout>
  );
}
