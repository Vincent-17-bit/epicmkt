import { Link } from "react-router-dom";
import LegalPage, { SiblingLinks } from "../components/LegalPage.jsx";
import FaqList from "../components/FaqList.jsx";
import { HELP_CONTACT, HELP_RELATED_LABEL, helpDocs } from "../config/help.js";
import { routes } from "../config/routes.js";
import { popularFaqs } from "../data/faqs.js";
import { t } from "../i18n/index.js";
import { usePageTitle } from "../hooks/usePageTitle.js";

const highlights = [
  { title: "Quick answers", text: "Common questions from shoppers and businesses." },
  { title: "Report a problem", text: "Tell us when a listing is wrong or misleading." },
  { title: "Talk to us", text: "Reach the team by phone, WhatsApp or email." }
];

const sections = [
  {
    id: "topics",
    title: "Find help",
    body: (
      <>
        <p>Choose the topic that matches what you need.</p>
        <SiblingLinks docs={helpDocs()} label="Help topics" />
      </>
    )
  },
  {
    id: "popular",
    title: "Popular questions",
    body: (
      <>
        <FaqList items={popularFaqs} idPrefix="popular" />
        <p>
          Looking for something else? See <Link to={routes.faq}>all the FAQs</Link>.
        </p>
      </>
    )
  }
];

const related = {
  label: HELP_RELATED_LABEL,
  docs: [
    { to: routes.about, label: t("nav.about"), blurb: "What EpicMKT is and what it does." },
    { to: routes.sellerGuide, label: t("nav.sellerGuide"), blurb: "How to list your business, step by step." },
    { to: routes.terms, label: "Terms of Service", blurb: "The rules for using EpicMKT." }
  ]
};

export default function Help() {
  usePageTitle("Help centre");
  return (
    <LegalPage
      eyebrow="Help"
      title="Help centre"
      intro="Find answers, report a problem or ask the EpicMKT team. Everything here is for people using EpicMKT in Kenya."
      highlights={highlights}
      sections={sections}
      contact={HELP_CONTACT}
      related={related}
    />
  );
}
