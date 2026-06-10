import type { Metadata } from "next";
import LegalLayout from "@/components/legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Windsor Beauty collects, uses and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="June 2026">
      <p>
        This policy explains how Windsor Beauty collects, uses and protects your
        personal information when you visit our website or place an order.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>Contact details, such as your name, email address and phone number</li>
        <li>Delivery details, such as your address and postcode</li>
        <li>Order details, such as the products you have purchased and order notes</li>
        <li>Basic technical information, such as browser type, used to keep the site working correctly</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <ul>
        <li>To process and despatch your order</li>
        <li>To send order confirmations and updates about your delivery</li>
        <li>To respond to questions sent through our contact page</li>
        <li>To send occasional newsletter emails, only if you have chosen to subscribe</li>
      </ul>

      <h2>How We Store Your Information</h2>
      <p>
        We take reasonable steps to keep your information secure. We do not sell or
        share your personal information with third parties for marketing purposes.
      </p>

      <h2>Cookies and Local Storage</h2>
      <p>
        Our website uses your browser&rsquo;s local storage to remember the contents
        of your basket between pages. This information stays on your device and is
        not shared with us until you place an order.
      </p>

      <h2>Your Rights</h2>
      <p>
        You can ask us what personal information we hold about you, request a copy
        of it, or ask us to correct or delete it, by contacting us via our{" "}
        <a href="/contact">contact page</a>.
      </p>

      <h2>Contact</h2>
      <p>
        If you have any questions about this privacy policy, please get in touch
        through our <a href="/contact">contact page</a>.
      </p>
    </LegalLayout>
  );
}
