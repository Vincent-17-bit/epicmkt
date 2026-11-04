import { Link } from "react-router-dom";
import LegalPage from "../components/LegalPage.jsx";
import { HELP_CONTACT, helpRelated } from "../config/help.js";
import { routes } from "../config/routes.js";
import { faqById } from "../data/faqs.js";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "Free to search", text: "Searching and contacting businesses costs you nothing." },
  { title: "Reach them in one tap", text: "Call, WhatsApp or get directions from the listing." },
  { title: "You agree the price", text: "Prices, orders and payment are agreed between you and the business." }
];

const sections = [
  {
    id: "shoppers",
    title: "For shoppers",
    body: (
      <>
        <ol>
          <li>
            <strong>Search.</strong> Look for a type of business or a name, or <Link to="/#categories">browse the categories</Link>.
          </li>
          <li>
            <strong>Open a listing.</strong> See the opening hours, items and prices, and any offers.
          </li>
          <li>
            <strong>Call, WhatsApp or get directions.</strong> Each listing has a button for each, so you can reach the business in one tap.
          </li>
          <li>
            <strong>Agree the price directly.</strong> You agree the order, price and payment with the business. EpicMKT does not take orders or
            handle payments.
          </li>
        </ol>
      </>
    )
  },
  {
    id: "businesses",
    title: "For businesses",
    body: (
      <>
        <ol>
          <li>
            <strong>Apply.</strong> Applying is free and takes about 5 minutes. Your answers are saved as you go.{" "}
            <Link to={routes.apply}>Start your application</Link>.
          </li>
          <li>
            <strong>We review.</strong> We check every application so customers can trust what they see. We may ask you to fix or add something.
            You can follow it on the <Link to={routes.applyStatus}>application status</Link> page.
          </li>
          <li>
            <strong>Pay by M-Pesa.</strong> When we approve you, we send the payment details by SMS and email. Pay your first month by M-Pesa
            Paybill, using the reference we give you as the account number.
          </li>
          <li>
            <strong>Go live.</strong> Your listing goes live once your first payment is confirmed.
          </li>
        </ol>
        <p>
          The <Link to={routes.sellerGuide}>seller guide</Link> has every step, and <Link to={routes.pricing}>pricing</Link> shows the plans.
        </p>
      </>
    )
  },
  {
    id: "labels",
    title: "What the labels mean",
    body: (
      <ul>
        <li>
          <strong>Featured.</strong> {faqById.featured.a}
        </li>
        <li>
          <strong>Verified.</strong> {faqById.verified.a}
        </li>
        <li>
          <strong>Closed.</strong> {faqById.closed.a}
        </li>
      </ul>
    )
  }
];

const related = helpRelated(routes.howItWorks);

export default function HowItWorks() {
  usePageTitle("How it works");
  return (
    <LegalPage
      eyebrow="Help"
      title="How EpicMKT works"
      intro="EpicMKT is a directory of local businesses in Kenya. Find what you need nearby, then contact the business directly."
      highlights={highlights}
      sections={sections}
      contact={HELP_CONTACT}
      related={related}
    />
  );
}
