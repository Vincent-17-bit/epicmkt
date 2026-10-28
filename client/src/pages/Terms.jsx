import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "A directory, not a shop", text: "EpicMKT helps you find and contact businesses. Your dealings are with the business." },
  { title: "Free for visitors", text: "Searching, browsing and contacting businesses costs you nothing." },
  { title: "Kenyan law applies", text: "These terms are governed by the laws of Kenya and your statutory rights are preserved." }
];

const sections = [
  {
    id: "acceptance",
    title: "Acceptance of these terms",
    body: (
      <>
        <p>
          These Terms of Service (the &ldquo;Terms&rdquo;) form a binding agreement between you and EpicMKT (&ldquo;EpicMKT&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) and govern your access to and use of the EpicMKT website, web application and related services (the
          &ldquo;Service&rdquo;).
        </p>
        <p>
          By accessing or using the Service you confirm that you have read, understood and agree to be bound by these Terms and by our{" "}
          <Link to="/privacy">Privacy Policy</Link> and <Link to="/cookies">Cookie notice</Link>. If you do not agree, you must stop using the
          Service.
        </p>
        <p>
          You must be at least 18 years old, or have the consent of a parent or guardian, to use the Service. If you use the Service on behalf of
          a business, you confirm that you have authority to bind that business to these Terms.
        </p>
      </>
    )
  },
  {
    id: "service",
    title: "The Service",
    body: (
      <>
        <p>
          EpicMKT is an online directory that helps people in Kenya discover local businesses and contact them by telephone, WhatsApp or by
          following directions. We provide the platform on which businesses publish their details; we do not own, operate, supply or control the
          businesses listed.
        </p>
        <p>We may change, suspend or discontinue any part of the Service at any time, and we do not promise that it will be uninterrupted or error free.</p>
      </>
    )
  },
  {
    id: "dealings",
    title: "Your dealings with businesses",
    body: (
      <>
        <p className="callout">
          EpicMKT is not a party to any transaction between you and a business. We do not take orders, make bookings, arrange deliveries, hold
          funds or process payments.
        </p>
        <p>
          Any enquiry, order, booking, price, delivery, payment, refund, warranty or dispute is agreed and carried out solely between you and the
          business concerned. You are responsible for deciding whether to deal with a business and for taking reasonable precautions, such as
          confirming details before you pay and inspecting goods or services.
        </p>
        <p>
          EpicMKT will never ask you for money on behalf of a business. If someone claiming to represent EpicMKT asks you for payment for a
          purchase, do not pay and <Link to="/contact">report it to us</Link>.
        </p>
      </>
    )
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree that you will not:</p>
        <ul>
          <li>use the Service for any unlawful, fraudulent, harassing, defamatory or misleading purpose;</li>
          <li>submit false reports, or content that infringes the rights of any person;</li>
          <li>
            scrape, harvest, copy or systematically extract data from the Service, or use automated means to access it, except as we expressly
            permit in writing;
          </li>
          <li>interfere with, probe, overload or attempt to gain unauthorised access to the Service, its servers or its security features;</li>
          <li>introduce malware or any code intended to damage or disrupt the Service or another person&rsquo;s device;</li>
          <li>impersonate any person or business, or misrepresent your affiliation with one.</li>
        </ul>
        <p>
          Misuse of the Service may constitute an offence under the Computer Misuse and Cybercrimes Act, 2018, and we may report it to the
          authorities.
        </p>
      </>
    )
  },
  {
    id: "listings",
    title: "Listing information",
    body: (
      <>
        <p>
          Business names, descriptions, prices, offers, photographs, availability and opening hours are supplied by the businesses themselves. We
          take reasonable steps to keep the directory accurate but we do not warrant that any listing is complete, current or correct.
        </p>
        <p>
          Opening status is calculated from the hours a business has set, in East Africa Time. Prices and stock can change without notice, so please
          confirm anything important with the business directly.
        </p>
        <p>
          A <strong>Verified</strong> badge means that we have checked certain details submitted by a business. It is not an endorsement, and it is
          not a guarantee of quality, safety, legality or conduct. A <strong>Featured</strong> label indicates a paid Premium listing.
        </p>
      </>
    )
  },
  {
    id: "sellers",
    title: "Business owners",
    body: (
      <>
        <p>
          If you list a business, you must also accept the Seller Terms presented during application, which apply in addition to these Terms. In
          the event of conflict, the Seller Terms prevail for matters relating to your listing.
        </p>
        <ul>
          <li>You are solely responsible for the accuracy, legality and currency of everything you publish, including prices, offers and photographs.</li>
          <li>You warrant that you own or are licensed to use the content you upload and that it does not infringe any third-party right.</li>
          <li>You must honour the prices and offers you advertise and comply with all laws that apply to your business, including consumer protection law.</li>
          <li>
            Listing fees are payable monthly for the Standard or Premium plan, as set out when you apply. Fees are for the listing service and are not
            connected to any sales you make.
          </li>
          <li>We may edit, suspend or remove any listing that is inaccurate, misleading, unlawful, in breach of these Terms or unpaid.</li>
        </ul>
      </>
    )
  },
  {
    id: "reports",
    title: "Reports and moderation",
    body: (
      <>
        <p>
          You can report a listing or a price that you believe to be wrong, misleading or unlawful. We review reports in good faith and may
          correct, suspend or remove a listing as we consider appropriate. We are not obliged to act on every report and we are under no general
          duty to monitor listings.
        </p>
        <p>
          If you believe content on the Service infringes your intellectual property or other rights, send us a notice through the{" "}
          <Link to="/contact">contact page</Link> identifying the content, the right concerned and your contact details.
        </p>
      </>
    )
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: (
      <>
        <p>
          The EpicMKT name, logo, design, software and the compilation of the directory are owned by or licensed to EpicMKT and protected by
          Kenyan and international law. We grant you a limited, revocable, non-exclusive, non-transferable licence to use the Service for its
          intended purpose.
        </p>
        <p>
          Content published by businesses remains theirs. By publishing it on EpicMKT, a business grants us a non-exclusive, royalty-free licence to
          host, display, reproduce and promote it in connection with the Service.
        </p>
      </>
    )
  },
  {
    id: "third-party",
    title: "Third-party services and links",
    body: (
      <p>
        The Service relies on and links to services we do not control, including telephone and WhatsApp, map and navigation applications and
        OpenStreetMap. Your use of them is governed by their own terms and privacy policies, and we are not responsible for their content or
        practices.
      </p>
    )
  },
  {
    id: "disclaimer",
    title: "Disclaimer of warranties",
    body: (
      <>
        <p>
          To the fullest extent permitted by law, the Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
          any kind, whether express or implied, including warranties of accuracy, fitness for a particular purpose and non-infringement.
        </p>
        <p>
          We do not warrant the quality, safety, legality or availability of any goods or services offered by a listed business, or the conduct of
          any business or user.
        </p>
      </>
    )
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <>
        <p>
          To the fullest extent permitted by law, EpicMKT and its directors, officers, employees and agents will not be liable for any indirect,
          incidental, special or consequential loss, or for loss of profit, revenue, data or goodwill, arising out of or in connection with the
          Service, your dealings with any business, or your reliance on any listing.
        </p>
        <p>
          Where liability cannot be excluded, our total aggregate liability to you for all claims arising from the Service will not exceed the
          amount, if any, you paid to EpicMKT in the twelve months before the claim arose.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, for fraud, or any liability or
          right that cannot lawfully be excluded or limited, including your rights under the Consumer Protection Act, 2012.
        </p>
      </>
    )
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        You agree to indemnify and hold harmless EpicMKT from claims, losses and reasonable costs, including legal fees, arising from your breach
        of these Terms, your unlawful use of the Service, or content you publish that infringes the rights of another person.
      </p>
    )
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <p>
        We may suspend or terminate your access to the Service, or remove your content, at any time and without notice if we reasonably believe you
        have breached these Terms or the law, or to protect the Service and its users. You may stop using the Service at any time. Clauses which by
        their nature should survive termination will do so.
      </p>
    )
  },
  {
    id: "privacy",
    title: "Personal data",
    body: (
      <p>
        We process personal data in accordance with the Data Protection Act, 2019 and our <Link to="/privacy">Privacy Policy</Link>, which forms part
        of these Terms.
      </p>
    )
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may revise these Terms from time to time. Material changes will be published on this page, and where the law requires we will give you
        notice. Your continued use of the Service after the revised Terms take effect constitutes acceptance of them.
      </p>
    )
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <>
        <p>These Terms are governed by the laws of Kenya.</p>
        <p>
          If a dispute arises, the parties will first try to resolve it in good faith through <Link to="/contact">written notice</Link> and
          negotiation. Failing resolution within thirty (30) days, the courts of Kenya will have exclusive jurisdiction, without prejudice to any
          right you have to approach a statutory regulator or tribunal.
        </p>
      </>
    )
  },
  {
    id: "general",
    title: "General",
    body: (
      <ul>
        <li>
          <strong>Entire agreement.</strong> These Terms, with the Privacy Policy, Cookie notice and any Seller Terms, are the entire agreement between
          you and EpicMKT on their subject matter.
        </li>
        <li>
          <strong>Severability.</strong> If any provision is held invalid or unenforceable, the remainder continues in full effect.
        </li>
        <li>
          <strong>No waiver.</strong> A failure or delay in enforcing a right is not a waiver of it.
        </li>
        <li>
          <strong>Assignment.</strong> You may not assign your rights under these Terms without our written consent. We may assign ours in connection
          with a reorganisation or transfer of the Service.
        </li>
        <li>
          <strong>Notices.</strong> We may give notice by publishing it on the Service or through the contact details you have provided.
        </li>
      </ul>
    )
  }
];

export default function Terms() {
  usePageTitle("Terms of Service");
  return (
    <LegalPage
      current="Terms of Service"
      eyebrow="Legal"
      title="Terms of Service"
      intro="The terms that apply when you use EpicMKT to find, compare and contact local businesses across Kenya."
      highlights={highlights}
      sections={sections}
    />
  );
}
