import { Link } from "react-router-dom";
import InfoPage from "../components/InfoPage.jsx";
import LegalSection from "../components/LegalSection.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function Terms() {
  usePageTitle("Terms of Service");
  return (
    <InfoPage
      title="Terms of Service"
      intro="By using EpicMKT you agree to these terms. Please read them, especially the section on what EpicMKT does and does not do. Last updated 2 October 2026."
    >
      <LegalSection title="EpicMKT only lists businesses">
        <p>
          <strong>
            EpicMKT is a directory. We only list businesses and help you find and contact them. We do not handle orders, bookings, deliveries
            or payments, and we are not a party to any dealing between you and a business.
          </strong>
        </p>
        <p>
          Any order, booking, price, payment, refund or dispute is arranged directly between you and the business. Do not send money to
          EpicMKT for a purchase. We will never ask you to pay us on behalf of a business.
        </p>
      </LegalSection>

      <LegalSection title="Using EpicMKT">
        <ul>
          <li>You may search, browse and contact businesses for free.</li>
          <li>You must not misuse the service, scrape it at scale, interfere with it, or use it to harass or defraud anyone.</li>
          <li>You must not submit false reports or content that is unlawful, misleading or infringes anyone&rsquo;s rights.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Listing information">
        <p>
          Business details, prices, offers, photos and opening hours are provided by the businesses. We try to keep them accurate, but we do
          not guarantee that they are complete, current or correct. Opening status is based on the hours a business has set in East Africa
          Time. Please call ahead to confirm anything important. A Verified badge means we have checked a business&rsquo;s details; it is not
          a guarantee of quality or of the business&rsquo;s conduct.
        </p>
      </LegalSection>

      <LegalSection title="Business owners">
        <ul>
          <li>Sellers pay a monthly fee for a Standard or Premium listing. Premium listings are marked Featured and appear first in results.</li>
          <li>You are responsible for the accuracy and lawfulness of everything you publish, including prices, offers and photos.</li>
          <li>You must have the right to use the images and content you upload.</li>
          <li>We may edit, suspend or remove a listing that is inaccurate, misleading, unlawful or unpaid.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Reporting a problem">
        <p>
          Use Report a problem on any listing if something is wrong. We review reports and may correct, suspend or remove listings, but we
          are not obliged to act on every report.
        </p>
      </LegalSection>

      <LegalSection title="Personal data">
        <p>
          We handle personal data in line with the Kenya Data Protection Act, 2019. Read how in our <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Our responsibility">
        <p>
          EpicMKT is provided as is. To the extent the law allows, we are not liable for the goods, services, prices, advice or conduct of any
          listed business, for losses from dealings between you and a business, or for interruptions to the service. Nothing in these terms
          limits any right you have under Kenyan consumer protection law that cannot be excluded.
        </p>
      </LegalSection>

      <LegalSection title="Changes and governing law">
        <p>
          We may update these terms, and the date at the top shows the latest change. Continued use means you accept the updated terms.
          These terms are governed by the laws of Kenya, and Kenyan courts have jurisdiction over any dispute.
        </p>
      </LegalSection>

      <LegalSection title="Questions">
        <p>
          <Link to="/contact">Contact us</Link> if you have any questions about these terms.
        </p>
      </LegalSection>
    </InfoPage>
  );
}
