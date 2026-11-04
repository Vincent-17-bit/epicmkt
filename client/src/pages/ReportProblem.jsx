import { Link } from "react-router-dom";
import { REPORT_REASONS } from "@epicmkt/shared";
import LegalPage from "../components/LegalPage.jsx";
import { helpRelated } from "../config/help.js";
import { routes } from "../config/routes.js";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "Pick a reason", text: "Choose from a short list, from wrong information to scams." },
  { title: "Details are optional", text: "Add a few words if they help. Your contact details are optional too." },
  { title: "We review reports", text: "We look into each report in good faith." }
];

const sections = [
  {
    id: "listing",
    title: "Report a listing",
    body: (
      <>
        <p>
          Open the business or item page and choose <strong>Report a problem</strong>. Pick a reason, add details if you like, and send it.
        </p>
        <p>
          Not sure where to start? <Link to="/#categories">Browse the categories</Link> or search for the business, then open its page.
        </p>
      </>
    )
  },
  {
    id: "reasons",
    title: "Reasons you can choose",
    body: (
      <ul>
        {REPORT_REASONS.map((reason) => (
          <li key={reason.value}>{reason.label}</li>
        ))}
      </ul>
    )
  },
  {
    id: "include",
    title: "What to include",
    body: (
      <ul>
        <li>What is wrong, in a sentence or two. Details can be up to 500 characters.</li>
        <li>The item or price you mean, if the problem is with one of them.</li>
        <li>Your phone number or email, only if you want us to be able to reach you.</li>
      </ul>
    )
  },
  {
    id: "next",
    title: "What happens next",
    body: (
      <>
        <p>
          We review reports in good faith. We may correct, suspend or remove a listing as we consider appropriate, and we are not obliged to act
          on every report.
        </p>
        <p>
          The <Link to={routes.terms}>Terms of Service</Link> explain how reports and moderation work.
        </p>
      </>
    )
  },
  {
    id: "other",
    title: "Not about one listing?",
    body: (
      <p>
        If someone claiming to represent EpicMKT asks you for money, do not pay. For this and any other problem that is not about a single
        listing, <Link to={routes.contact}>contact EpicMKT</Link>.
      </p>
    )
  }
];

const contact = {
  id: "help-contact-title",
  title: "Cannot report from a listing?",
  text: "Email or WhatsApp us the business name and what is wrong, and we will look into it.",
  label: "Contact EpicMKT",
  to: routes.contact
};

const related = helpRelated(routes.reportProblem);

export default function ReportProblem() {
  usePageTitle("Report a problem");
  return (
    <LegalPage
      eyebrow="Help"
      title="Report a problem"
      intro="Tell us when a listing is wrong, closed or misleading, so it can be put right."
      highlights={highlights}
      sections={sections}
      contact={contact}
      related={related}
    />
  );
}
