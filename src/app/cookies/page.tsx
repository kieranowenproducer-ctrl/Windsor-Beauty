import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function CookiePolicyPage() {
  return (
    <PolicyPage
      contentKey="cookies"
      title="Cookie Policy"
      intro="A short explanation of the cookies and similar technologies we use on this site, and how you can manage them."
    >
      <PolicySection heading="What Cookies Are">
        <p>
          Cookies are small text files placed on your device when you visit a website. They help the site remember
          information about your visit, such as your preferences and the contents of your basket, and can also help
          us understand how the site is used so that we can improve it.
        </p>
      </PolicySection>

      <PolicySection heading="How We Use Cookies and Local Storage">
        <p>We use cookies and similar browser storage for purposes including:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li><span className="text-stone-600 font-medium">Essential functions</span> — remembering the contents of your shopping basket, keeping you signed in, and recording that you have confirmed our entry requirements (including age confirmation and acceptance of our Terms and Conditions) so that you are not asked again during the same session.</li>
          <li><span className="text-stone-600 font-medium">Preferences</span> — remembering choices you make on the site, such as dismissing a pop-up, so your experience is smoother on return visits.</li>
          <li><span className="text-stone-600 font-medium">Performance and analytics</span> — helping us understand how visitors use the site so we can identify and fix issues and improve the overall experience.</li>
          <li><span className="text-stone-600 font-medium">Marketing</span> — where you have given consent, helping us measure the effectiveness of offers such as discount codes and tailoring communications accordingly.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="Managing Cookies">
        <p>
          Most browsers allow you to view, manage, delete and block cookies for a website. Please be aware that if
          you choose to block essential cookies, parts of this site — such as the shopping basket or entry
          requirements check — may not work as intended. You can find instructions for managing cookies in your
          particular browser&rsquo;s help documentation.
        </p>
      </PolicySection>

      <PolicySection heading="Third-Party Cookies">
        <p>
          Some features of this site — such as payment processing, marketing tools, or embedded content — may set
          their own cookies provided by trusted third parties. These third parties are responsible for their own
          cookie practices, and we encourage you to review their respective policies for further information.
        </p>
      </PolicySection>

      <PolicySection heading="Changes to This Policy">
        <p>
          We may update this Cookie Policy from time to time to reflect changes in the technologies we use or in
          relevant law. Please check back here periodically to stay informed.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
