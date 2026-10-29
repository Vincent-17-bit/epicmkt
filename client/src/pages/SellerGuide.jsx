import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage.jsx";
import ListBusinessBanner from "../components/ListBusinessBanner.jsx";
import { APPLY_PATH, PLANS_PDF_PATH } from "../components/SellBlocks.jsx";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "Free to apply", text: "You pay only after we approve your application." },
  { title: "No commission", text: "One flat monthly fee, and every sale is yours." },
  { title: "Found nearby", text: "Customers call, WhatsApp or get directions in one tap." }
];

const sections = [
  {
    id: "before",
    title: "Before you apply",
    body: (
      <>
        <p>Applying takes about 5 minutes and your answers are saved as you go. Have these ready:</p>
        <ul>
          <li>Your National ID, Maisha Card or passport.</li>
          <li>Your Single Business Permit.</li>
          <li>A photo of your signboard or shop front.</li>
          <li>Your KRA PIN and registration certificate, if your business is registered.</li>
          <li>The phone and WhatsApp numbers customers should use to reach you.</li>
        </ul>
        <p>Some types of business are asked for one more document. The form shows you which.</p>
      </>
    )
  },
  {
    id: "plan",
    title: "Choose a plan",
    body: (
      <>
        <p>Both plans give you a business page with Call, WhatsApp and Directions buttons, your opening hours, items and prices, offers, and a short link and QR code.</p>
        <ul>
          <li>
            <strong>Standard</strong> lists your business in search and category pages.
          </li>
          <li>
            <strong>Premium</strong> adds a Featured badge, priority placement in search and category lists, bulk import for your items, more photos
            and priority support.
          </li>
        </ul>
        <p>
          Your monthly fee depends on your type of business. See <Link to="/pricing">pricing for every type of business</Link>, or ask the admin for the{" "}
          <Link to={PLANS_PDF_PATH}>plans PDF</Link>.
        </p>
      </>
    )
  },
  {
    id: "apply",
    title: "Send your application",
    body: (
      <>
        <p>The form has five short steps:</p>
        <ol>
          <li>
            <strong>Your business.</strong> Your type of business, its name and a short description.
          </li>
          <li>
            <strong>About you.</strong> Your name, phone number and email.
          </li>
          <li>
            <strong>Where customers find you.</strong> Your location on the map and how customers can contact you.
          </li>
          <li>
            <strong>Permits and documents.</strong> Your permit details and clear photos of your documents.
          </li>
          <li>
            <strong>Your plan.</strong> Choose Standard or Premium, check your answers and send.
          </li>
        </ol>
        <p>
          Your draft is saved on this device, so you can leave and pick it up later. <Link to={APPLY_PATH}>Start your application</Link>.
        </p>
      </>
    )
  },
  {
    id: "review",
    title: "We check your details",
    body: (
      <>
        <p>
          We review every application so customers can trust what they see. We may ask you to fix or add something. You can follow your application
          on the <Link to="/become-a-seller/status">application status</Link> page.
        </p>
        <p>
          Businesses whose details we have checked can carry a <strong>Verified</strong> badge. It shows that we checked those details. It is not a
          promise about quality.
        </p>
      </>
    )
  },
  {
    id: "pay",
    title: "Pay and go live",
    body: (
      <>
        <p className="callout">You pay nothing until your application is approved.</p>
        <p>
          When we approve you, we send the payment details by SMS and email. Pay your first month by M-Pesa Paybill, using the reference we give you
          as the account number. If you pay less than the full amount, the money is kept and we tell you how much more is needed.
        </p>
        <p>Once your payment is confirmed, we create your seller login and send it to you, and your listing goes live.</p>
        <p>
          To renew, pay the monthly fee with your Seller ID as the account number. You can pay several months ahead, and anything left over is kept
          as credit.
        </p>
      </>
    )
  },
  {
    id: "page",
    title: "Build your page",
    body: (
      <>
        <p>Sign in to your seller dashboard with the login we send you, then add what customers want to see:</p>
        <ul>
          <li>Photos for your gallery and for each item.</li>
          <li>Your items or services, with prices.</li>
          <li>Your opening hours, including days you close early or take off.</li>
          <li>Offers and flash sales.</li>
        </ul>
        <p>Your page comes with a short link and a QR code. Share them on WhatsApp and social media, or print the QR code for your shop.</p>
      </>
    )
  },
  {
    id: "results",
    title: "See what is working",
    body: (
      <p>
        Your dashboard counts how many people viewed your page and how many called you, messaged you on WhatsApp or asked for directions, so you know
        your listing is paying off.
      </p>
    )
  },
  {
    id: "standing",
    title: "Keep your listing in good standing",
    body: (
      <>
        <ul>
          <li>Keep your prices, offers, hours and photos accurate and up to date.</li>
          <li>Honour the prices and offers you advertise.</li>
          <li>Renew on time. After a short grace period, an unpaid listing may be taken down until you pay.</li>
          <li>Deal with customers directly. EpicMKT does not take orders or handle payments between you and your customers.</li>
        </ul>
        <p>
          The full rules are in our <Link to="/terms">Terms of Service</Link>, including the Seller Terms you accept when you apply.
        </p>
      </>
    )
  }
];

const contact = {
  title: "Need help getting listed?",
  text: "Ask the EpicMKT team about your application, your plan or a payment.",
  label: "Contact EpicMKT",
  to: "/contact"
};

const related = {
  label: "Related pages",
  docs: [
    { to: "/pricing", label: "Pricing", blurb: "Plans and prices for every type of business." },
    { to: "/faq", label: "FAQs", blurb: "Answers to common questions." },
    { to: "/terms", label: "Terms of Service", blurb: "The rules for using EpicMKT." }
  ]
};

export default function SellerGuide() {
  usePageTitle("Seller guide");
  return (
    <LegalPage
      eyebrow="For businesses"
      title="Seller guide"
      intro="How to list your business on EpicMKT, from your first application to your first customers."
      highlights={highlights}
      sections={sections}
      contact={contact}
      related={related}
    >
      <ListBusinessBanner to={APPLY_PATH} titleId="guide-cta-title" />
    </LegalPage>
  );
}
