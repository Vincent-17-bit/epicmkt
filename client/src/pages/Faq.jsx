import LegalPage from "../components/LegalPage.jsx";
import FaqList from "../components/FaqList.jsx";
import { HELP_CONTACT, helpRelated } from "../config/help.js";
import { routes } from "../config/routes.js";
import { allFaqs, faqGroups } from "../data/faqs.js";
import { useFaqJsonLd } from "../hooks/useFaqJsonLd.js";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "Free to search", text: "Searching and contacting businesses costs you nothing." },
  { title: "Contact directly", text: "Call, WhatsApp or get directions from any listing." },
  { title: "No commission", text: "Businesses pay one flat monthly fee, and every sale is theirs." }
];

const sections = faqGroups.map((group) => ({
  id: group.id,
  title: group.title,
  body: <FaqList items={group.items} idPrefix={`faq-${group.id}`} />
}));

const related = helpRelated(routes.faq);

export default function Faq() {
  usePageTitle("FAQs");
  useFaqJsonLd(allFaqs);
  return (
    <LegalPage
      eyebrow="Help"
      title="Frequently asked questions"
      intro="Answers about finding businesses, listing your own, pricing and staying safe."
      highlights={highlights}
      sections={sections}
      contact={HELP_CONTACT}
      related={related}
    />
  );
}
