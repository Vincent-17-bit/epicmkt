import { Link } from "react-router-dom";
import InfoPage from "../components/InfoPage.jsx";
import LegalSection from "../components/LegalSection.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

export default function Cookies() {
  usePageTitle("Cookie notice");
  return (
    <InfoPage
      title="Cookie notice"
      intro="This notice explains what EpicMKT stores on your device and how to control it. Last updated 2 October 2026."
    >
      <LegalSection title="What we store">
        <ul>
          <li>
            <strong>Your choices.</strong> Your theme (light, dark or system) and the town you choose if you do not share your location.
          </li>
          <li>
            <strong>Cached pages.</strong> Pages and images saved by the app so EpicMKT loads faster and works offline.
          </li>
        </ul>
        <p>These are needed for the service to work the way you set it up. We do not use advertising cookies.</p>
      </LegalSection>

      <LegalSection title="Third-party content">
        <p>
          Map previews on business pages are loaded from OpenStreetMap, which may set its own cookies. When you tap Call, WhatsApp or
          Directions you leave EpicMKT, and those apps handle their own cookies and data.
        </p>
      </LegalSection>

      <LegalSection title="Your controls">
        <p>
          You can clear stored data and cookies at any time in your browser settings. If you do, EpicMKT will forget your theme and town and
          you may need to choose them again.
        </p>
      </LegalSection>

      <LegalSection title="More information">
        <p>
          Read how we handle personal data in our <Link to="/privacy">Privacy Policy</Link>, or <Link to="/contact">contact us</Link> with
          any questions.
        </p>
      </LegalSection>
    </InfoPage>
  );
}
