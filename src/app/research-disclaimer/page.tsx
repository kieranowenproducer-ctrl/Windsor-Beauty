import PolicyPage from '@/components/PolicyPage';
import { PolicySection } from '@/components/PolicyLayout';

export default function ResearchDisclaimerPage() {
  return (
    <PolicyPage
      contentKey="research-disclaimer"
      title="Research Use Disclaimer"
      intro="A clear statement of the basis on which every product on this site is sold: for laboratory research only, and not for human consumption."
    >
      <PolicySection heading="Not for Human or Animal Consumption">
        <p>
          All products listed on this website are sold exclusively for in-vitro laboratory research and experimental
          use. They are not for human or animal consumption in any form, by any route, and must not be ingested,
          injected, inhaled, applied to the body, or otherwise introduced into a human or animal under any
          circumstances.
        </p>
      </PolicySection>

      <PolicySection heading="Sold to Qualified Researchers">
        <p>
          By placing an order, you confirm that you are purchasing as a qualified individual or organisation
          conducting legitimate laboratory research, that you understand the handling and storage requirements of
          research compounds, and that you will use any product purchased from us solely within a controlled research
          environment.
        </p>
      </PolicySection>

      <PolicySection heading="No Endorsement of Other Use">
        <p>
          Windsor Beauty does not endorse, encourage, or condone the use of any product sold on this site for purposes
          other than laboratory research. Any reference material we provide — including our Dosage Guide and
          calculator — exists only to support consistent handling and reconstitution of compounds for research
          purposes, and carries no implication that the product is suitable, safe, or approved for any other use.
        </p>
      </PolicySection>

      <PolicySection heading="Compliance With Local Law">
        <p>
          It is your responsibility to ensure that purchasing, possessing, and using any product from this site is
          lawful in your jurisdiction, and that you comply with any licensing, storage, or handling requirements that
          apply to research compounds where you are located.
        </p>
      </PolicySection>

      <PolicySection heading="Acceptance of This Disclaimer">
        <p>
          By using this website and placing an order, you confirm that you have read and understood this Research Use
          Disclaimer and agree to be bound by it, alongside our Product Disclaimer, Age Restriction Policy, and Terms
          and Conditions.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
