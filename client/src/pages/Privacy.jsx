import { Link } from "react-router-dom";
import InfoPage from "../components/InfoPage.jsx";
import LegalSection from "../components/LegalSection.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function Privacy() {
  usePageTitle("Privacy Policy");
  return (
    <InfoPage
      title="Privacy Policy"
      intro="This policy explains what personal data EpicMKT handles, why, and the rights you have under the Kenya Data Protection Act, 2019. Last updated 2 October 2026."
    >
      <LegalSection title="Who we are">
        <p>
          EpicMKT is a directory of local businesses in Kenya. We list businesses so you can call, message on WhatsApp or get directions. We
          do not take orders or payments. For the purposes of the Data Protection Act, 2019, EpicMKT is the data controller of the data
          described below.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <ul>
          <li>
            <strong>Searches and browsing.</strong> The terms you search for and the pages you open, used to improve results and show
            popular searches.
          </li>
          <li>
            <strong>Your location.</strong> Only if you allow it in your browser. We use it to show how far a business is from you and to
            sort nearby results. You can refuse and still use EpicMKT.
          </li>
          <li>
            <strong>Contact taps.</strong> A count of how often a business is called, messaged on WhatsApp or opened in directions. These
            counts are not tied to your name or phone number.
          </li>
          <li>
            <strong>Reports.</strong> If you report a problem with a listing, we keep the reason, your message and any phone number or email
            you choose to give.
          </li>
          <li>
            <strong>Business owners.</strong> Sellers give us business details, a phone number, a WhatsApp number and optionally an email,
            photos and social links, which are shown publicly on the listing.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Why we use it">
        <ul>
          <li>To run the directory, rank results and show distances.</li>
          <li>To give business owners simple statistics on how many people viewed and contacted them.</li>
          <li>To review reports and keep listings accurate and safe.</li>
          <li>To meet our legal obligations.</li>
        </ul>
        <p>We rely on your consent for location, and on our legitimate interest in running and improving the service for everything else.</p>
      </LegalSection>

      <LegalSection title="Sharing">
        <p>
          We do not sell your personal data. Business details that sellers choose to publish are visible to everyone. When you tap Call,
          WhatsApp or Directions, you leave EpicMKT and the phone app, WhatsApp or your maps app handles that contact under its own privacy
          terms. We may share data where the law requires it or to protect people from harm.
        </p>
      </LegalSection>

      <LegalSection title="Storage on your device">
        <p>
          EpicMKT stores your theme choice and cached pages on your device so the site loads faster and works offline. You can clear this at
          any time in your browser settings.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          We keep personal data only as long as needed for the purposes above. Reports are kept until they have been reviewed and a
          reasonable period afterwards. Listing details are removed when a seller closes their listing, unless we must keep them by law.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>Under the Data Protection Act, 2019 you have the right to:</p>
        <ul>
          <li>be told how your personal data is used;</li>
          <li>access the personal data we hold about you;</li>
          <li>object to the processing of your personal data;</li>
          <li>ask us to correct data that is wrong or misleading;</li>
          <li>ask us to delete data we no longer need.</li>
        </ul>
        <p>
          To use any of these rights, <Link to="/contact">contact us</Link>. If you are not satisfied with our response, you can complain to
          the Office of the Data Protection Commissioner of Kenya at{" "}
          <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">
            odpc.go.ke
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          We take reasonable steps to protect personal data from loss, misuse and unauthorised access. No online service is completely
          secure, so please share only what you are comfortable sharing.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>EpicMKT is not directed at children, and we do not knowingly collect personal data from children.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy. The date at the top shows when it last changed. Continued use of EpicMKT after a change means you accept
          the updated policy. See also our <Link to="/terms">Terms of Service</Link>.
        </p>
      </LegalSection>
    </InfoPage>
  );
}
