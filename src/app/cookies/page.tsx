import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';
import { SITE_URL } from '../robots';

const DESCRIPTION = 'The cookies and browser storage the Windsor Beauty skincare shop uses, what they are '
  + 'for, and how you can manage them.';

export const metadata: Metadata = {
  title: 'Cookie Policy | Windsor Beauty',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/cookies` },
};

export default function CookiePolicyPage() {
  return (
    <PolicyPage
      contentKey="cookies"
      title="Cookie Policy"
      intro="A short explanation of the cookies and similar technologies we use on this site, and how you can manage them."
    >
      <PolicySection heading="What Cookies Are">
        <p>
          Cookies are small text files placed on your device when you visit a website. Websites can also keep small
          amounts of information in your browser&rsquo;s own storage. Both help a site remember things about your
          visit, such as the contents of your basket.
        </p>
      </PolicySection>

      <PolicySection heading="How We Use Cookies and Browser Storage">
        <p>We use cookies and browser storage for the following purposes:</p>
        <ul className="list-disc list-outside pl-5 space-y-1.5">
          <li><span className="text-stone-600 font-medium">Essential functions:</span> remembering the contents of your shopping basket, keeping you signed in to your account, and keeping track of an order while you complete payment.</li>
          <li><span className="text-stone-600 font-medium">Preferences:</span> remembering choices you make on the site, such as closing a pop-up or a notice you have already seen, so you are not shown it again.</li>
          <li><span className="text-stone-600 font-medium">Our own visit measurement:</span> we record visits and shop actions, such as viewing a product or adding it to your basket, so we can understand how the shop is used and improve it. This is done by our own website rather than by an outside analytics company.</li>
          <li><span className="text-stone-600 font-medium">Referrals and campaigns:</span> if you arrive through a referral link or a QR code, a cookie remembers this for up to 12 months so the right person or campaign can be credited.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="Managing Cookies">
        <p>
          Most browsers allow you to view, manage, delete and block cookies for a website. Please be aware that if
          you block essential cookies or browser storage, parts of this site, such as the shopping basket or signing
          in, may not work as intended. You can find instructions in your browser&rsquo;s help pages.
        </p>
      </PolicySection>

      <PolicySection heading="Third-Party Cookies">
        <p>
          At the time of writing, this site does not set advertising or analytics cookies from other companies. When
          you pay, you are taken to the secure pages of your bank or payment provider, which may set their own
          cookies under their own policies.
        </p>
      </PolicySection>

      <PolicySection heading="Changes to This Policy">
        <p>
          We may update this Cookie Policy from time to time to reflect changes in the technologies we use or in
          relevant law. If we start using new kinds of cookies, we will update this page.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
