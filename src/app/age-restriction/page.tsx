import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function AgeRestrictionPage() {
  return (
    <PolicyPage
      contentKey="age-restriction"
      title="Age Restriction & Access Policy"
      intro="This website and its contents are restricted to adults. This page explains why, and what we ask of every visitor before they enter."
    >
      <PolicySection heading="18+ Access Only">
        <p>
          This website, and every product listed on it, is intended strictly for use by adults aged 18 or over who
          are accessing the site for legitimate laboratory or research purposes. By entering this site, you confirm
          that you meet this requirement.
        </p>
      </PolicySection>

      <PolicySection heading="Why We Ask You to Confirm Your Age">
        <p>
          Our products are research compounds, not consumer goods, and are not suitable or intended for anyone outside
          of a qualified research setting. Asking visitors to confirm their age and acknowledge our terms before
          entering the site is one of the ways we keep our catalogue restricted to the audience it is intended for.
        </p>
      </PolicySection>

      <PolicySection heading="The Entry Confirmation">
        <p>
          Before browsing the site, you will be asked to confirm that you are 18 or over and that you accept our Terms
          and Conditions. We record this confirmation for the duration of your session so that you are not asked
          again unnecessarily, and so that we can demonstrate, where required, that visitors were given the
          opportunity to review our terms before proceeding.
        </p>
      </PolicySection>

      <PolicySection heading="If You Do Not Meet These Requirements">
        <p>
          If you are under 18, or are not accessing this site for legitimate research purposes, please do not proceed
          beyond the entry page. We may take steps to restrict or refuse access, and to cancel any order, where we
          reasonably believe these requirements have not been met.
        </p>
      </PolicySection>

      <PolicySection heading="Related Policies">
        <p>
          This policy works alongside our Terms and Conditions, Product Disclaimer and Research Use Disclaimer, all of
          which set out the basis on which this site and its products may be accessed and used.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
