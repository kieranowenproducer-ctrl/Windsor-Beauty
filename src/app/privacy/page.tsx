import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage
      contentKey="privacy"
      title="Privacy Policy"
      intro="This page explains what personal information we collect, why we collect it, and how we look after it."
    >
      <PolicySection heading="Who We Are">
        <p>
          Windsor Glow, operated by C&amp;S Holdings Group, is the data controller responsible for the personal
          information described in this policy. Any questions about this policy or how your data is handled can be
          directed to our support team via the Contact page.
        </p>
      </PolicySection>

      <PolicySection heading="Information We Collect">
        <p>We may collect and process the following types of information:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li>Contact details you provide when creating an account, placing an order, verifying a product, or contacting us — such as your name, email address, delivery address and phone number.</li>
          <li>Order and transaction details, including the products you purchase and basic payment confirmation information (we do not store full card details — these are handled directly by our payment provider).</li>
          <li>Information submitted through our product verification system, including the verification code entered, the order number or email address provided, and basic technical information such as your IP address and device/browser type, used to protect the system from misuse.</li>
          <li>Marketing preferences, including whether you have opted in to receive offers or updates from us, and any discount codes issued to you.</li>
          <li>Technical and usage information collected automatically through cookies and similar technologies, as described in our Cookie Policy.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="How We Use Your Information">
        <p>We use personal information for purposes including:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li>Processing and delivering your orders, and communicating with you about them.</li>
          <li>Operating and improving our product verification system, including preventing fraudulent or repeated misuse of verification codes.</li>
          <li>Managing your account and providing customer support.</li>
          <li>Sending you marketing communications, but only where you have given clear, separate consent to receive them — for example, by ticking a consent box when signing up for a discount or verifying a product. We never add you to a marketing list without this consent.</li>
          <li>Meeting our legal, accounting and regulatory obligations.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="Our Legal Basis for Processing">
        <p>
          We rely on different legal grounds depending on the activity: performing our contract with you (for
          example, fulfilling an order), our legitimate interests (for example, preventing misuse of verification
          codes or improving our services), your consent (for example, marketing communications), and compliance
          with our legal obligations (for example, maintaining records for tax purposes).
        </p>
      </PolicySection>

      <PolicySection heading="How Long We Keep Information">
        <p>
          We keep personal information for as long as necessary to fulfil the purposes described in this policy,
          including any legal, accounting or reporting requirements. Verification records are retained to maintain
          the integrity of our one-time-use code system and to support fraud prevention. You can ask us to review or
          delete your information at any time, subject to our legal obligations.
        </p>
      </PolicySection>

      <PolicySection heading="Sharing Your Information">
        <p>
          We do not sell personal information. We may share it with trusted third parties who help us run our
          business — such as payment processors, delivery couriers, IT and hosting providers, and email or marketing
          platforms — and only to the extent needed for them to provide their service to us. These providers are
          required to keep your information secure and to use it only for the purposes we specify.
        </p>
      </PolicySection>

      <PolicySection heading="Keeping Your Information Secure">
        <p>
          We use appropriate technical and organisational measures to protect personal information against
          unauthorised access, loss, misuse or alteration. Our verification system, for example, stores codes and
          usage records in a secured database rather than in publicly accessible files.
        </p>
      </PolicySection>

      <PolicySection heading="Your Rights">
        <p>
          Depending on where you live, you may have rights to access, correct, delete, restrict or object to our use
          of your personal information, and to ask for a copy of it in a portable format. To exercise any of these
          rights, please contact our support team — we will respond as quickly as we can and in line with applicable
          law.
        </p>
      </PolicySection>

      <PolicySection heading="Changes to This Policy">
        <p>
          We may update this policy from time to time to reflect changes in our practices or in the law. The version
          published on this page is the current version. We encourage you to review it periodically.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
