import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "We never sell your data", text: "Your personal data is not sold, rented or traded." },
  { title: "Location is optional", text: "We use it only if you allow it, and you can refuse and still use EpicMKT." },
  { title: "You are in control", text: "Access, correct, object to or delete your data at any time." }
];

const sections = [
  {
    id: "controller",
    title: "Who we are",
    body: (
      <>
        <p>
          This Privacy Policy explains how EpicMKT (&ldquo;EpicMKT&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, shares and protects
          personal data when you use our website and application (the &ldquo;Service&rdquo;).
        </p>
        <p>
          EpicMKT is the <strong>data controller</strong> for the personal data described here for the purposes of the Data Protection Act, 2019
          (the &ldquo;Act&rdquo;) and the regulations made under it. You can reach us at any time through the{" "}
          <Link to="/contact">contact page</Link>.
        </p>
        <p>
          Business owners who apply to list a business are also given a separate Seller Privacy Notice at the point of application, which covers
          the additional information we collect from them.
        </p>
      </>
    )
  },
  {
    id: "collect",
    title: "Personal data we collect",
    body: (
      <>
        <ul>
          <li>
            <strong>Search and usage data.</strong> The terms you search for, filters you apply, pages and listings you view, and basic technical
            information your browser sends automatically, such as browser and device type.
          </li>
          <li>
            <strong>Location.</strong> Your approximate or precise location, only where you give permission in your browser, or the town you
            select manually.
          </li>
          <li>
            <strong>Contact interactions.</strong> A count of how often a business is called, messaged on WhatsApp or opened in directions. These
            counts are not linked to your name or telephone number.
          </li>
          <li>
            <strong>Reports and messages.</strong> If you report a listing or contact us, the reason, your message and any name, telephone number or
            email address you choose to give.
          </li>
          <li>
            <strong>Business owner information.</strong> Business details, telephone and WhatsApp numbers, photographs and links that sellers
            publish on a listing, which are visible to everyone.
          </li>
        </ul>
        <p>We do not knowingly collect sensitive personal data from visitors, and you should not include it in a report or message.</p>
      </>
    )
  },
  {
    id: "purposes",
    title: "How and why we use it",
    body: (
      <>
        <p>We process personal data only for specified, lawful purposes:</p>
        <ul>
          <li>to operate the directory, rank results and show distances from you;</li>
          <li>to give business owners aggregate statistics about views and contacts;</li>
          <li>to review reports, prevent fraud and abuse, and keep listings accurate and safe;</li>
          <li>to respond to your enquiries and requests;</li>
          <li>to maintain, secure and improve the Service; and</li>
          <li>to comply with our legal obligations.</li>
        </ul>
      </>
    )
  },
  {
    id: "basis",
    title: "Legal basis for processing",
    body: (
      <>
        <p>Under the Act we rely on the following lawful bases:</p>
        <ul>
          <li>
            <strong>Consent</strong>, for your location. You may withdraw consent at any time in your browser or device settings, without affecting
            the lawfulness of processing before withdrawal.
          </li>
          <li>
            <strong>Legitimate interests</strong>, in running, securing and improving the Service, where these are not overridden by your rights
            and freedoms.
          </li>
          <li>
            <strong>Legal obligation</strong>, where we must retain or disclose data to comply with the law.
          </li>
        </ul>
      </>
    )
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p className="callout">We do not sell your personal data.</p>
        <p>We share personal data only with:</p>
        <ul>
          <li>
            <strong>Service providers</strong> who host, secure and support the Service on our behalf, under written terms that require them to
            protect it and use it only on our instructions;
          </li>
          <li>
            <strong>The public</strong>, in the case of business details that sellers choose to publish;
          </li>
          <li>
            <strong>Authorities and advisers</strong>, where the law requires, to enforce our rights, or to protect people from harm.
          </li>
        </ul>
        <p>
          When you tap Call, WhatsApp or Directions you leave EpicMKT. The telephone, WhatsApp or maps provider then handles your data under its own
          privacy terms.
        </p>
      </>
    )
  },
  {
    id: "transfers",
    title: "Transfers outside Kenya",
    body: (
      <p>
        Some of our service providers may process data on servers outside Kenya. Where this happens we ensure that appropriate safeguards are in
        place, or that another lawful ground applies, as required by the Act.
      </p>
    )
  },
  {
    id: "retention",
    title: "How long we keep data",
    body: (
      <>
        <p>We keep personal data only for as long as necessary for the purposes above:</p>
        <ul>
          <li>search and usage records are kept in a form that is aggregated or de-identified where practicable;</li>
          <li>reports are kept until reviewed and for a reasonable period afterwards;</li>
          <li>listing details are removed after a seller closes a listing, unless the law requires us to retain them.</li>
        </ul>
        <p>When data is no longer needed we delete it or anonymise it.</p>
      </>
    )
  },
  {
    id: "device",
    title: "Storage on your device",
    body: (
      <p>
        We store your theme and town preferences and cached pages on your device so the Service loads faster and works offline. You can clear them
        at any time. See our <Link to="/cookies">Cookie notice</Link> for details.
      </p>
    )
  },
  {
    id: "rights",
    title: "Your rights",
    body: (
      <>
        <p>Under the Act you have the right to:</p>
        <ul>
          <li>be informed of how your personal data is used;</li>
          <li>access the personal data we hold about you;</li>
          <li>object to the processing of all or part of your personal data;</li>
          <li>request correction of data that is false, inaccurate or misleading;</li>
          <li>request deletion of data we no longer have a lawful reason to keep; and</li>
          <li>withdraw your consent where we rely on it.</li>
        </ul>
        <p>
          To exercise a right, <Link to="/contact">contact us</Link>. We may ask you to verify your identity first, and we will respond within the
          period the law provides.
        </p>
        <p>
          If you are not satisfied with our response you may lodge a complaint with the Office of the Data Protection Commissioner of Kenya at{" "}
          <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">
            odpc.go.ke
          </a>
          .
        </p>
      </>
    )
  },
  {
    id: "security",
    title: "Security and breaches",
    body: (
      <p>
        We use reasonable technical and organisational measures to protect personal data against loss, misuse, unauthorised access and disclosure.
        No online service is completely secure. If a breach affects your rights and freedoms we will notify the Data Commissioner and, where
        required, you, as the Act provides.
      </p>
    )
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        The Service is not directed at children and we do not knowingly collect their personal data. If you believe a child has given us personal
        data, please <Link to="/contact">contact us</Link> and we will delete it.
      </p>
    )
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy to reflect changes in our practices or the law. We will publish the revised policy on this page and, where required,
        tell you directly. Please read it together with our <Link to="/terms">Terms of Service</Link>.
      </p>
    )
  }
];

export default function Privacy() {
  usePageTitle("Privacy Policy");
  return (
    <LegalPage
      current="Privacy Policy"
      eyebrow="Legal"
      title="Privacy Policy"
      intro="How EpicMKT collects, uses and protects your personal data, and the rights you hold under the Kenya Data Protection Act, 2019."
      highlights={highlights}
      sections={sections}
    />
  );
}
