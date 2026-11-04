import { routes } from "./routes.js";
import { t } from "../i18n/index.js";

// Copy and cross-links shared by the Help pages and the For businesses pages.
// Cards are { to, label, blurb }, the shape SiblingLinks takes.

export const HELP_RELATED_LABEL = "More help";
export const BUSINESS_RELATED_LABEL = "For businesses";

const helpPages = [
  { to: routes.faq, labelKey: "nav.faq", blurb: "Answers to common questions." },
  { to: routes.howItWorks, labelKey: "nav.howItWorks", blurb: "How to find, contact and list a business." },
  { to: routes.reportProblem, labelKey: "nav.reportProblem", blurb: "Tell us about a wrong or misleading listing." },
  { to: routes.suggestBusiness, labelKey: "nav.suggestBusiness", blurb: "Know a business we should list? Tell us." }
];

const businessPages = [
  { to: routes.apply, labelKey: "nav.becomeASeller", blurb: "Apply to list your business." },
  { to: routes.pricing, labelKey: "nav.pricing", blurb: "Plans and prices for every type of business." },
  { to: routes.sellerGuide, labelKey: "nav.sellerGuide", blurb: "How to apply, pay and go live." }
];

const cards = (pages, except) => pages.filter((p) => p.to !== except).map(({ to, labelKey, blurb }) => ({ to, label: t(labelKey), blurb }));

/** The Help pages as cards, leaving out the page you are on. */
export const helpDocs = (except) => cards(helpPages, except);

/** The three For businesses pages as cards, leaving out the page you are on. */
export const businessDocs = (except) => cards(businessPages, except);

/** The `related` prop for a Help page. */
export const helpRelated = (except) => ({ label: HELP_RELATED_LABEL, docs: helpDocs(except) });

/** The `related` prop for a For businesses page. */
export const businessRelated = (except) => ({ label: BUSINESS_RELATED_LABEL, docs: businessDocs(except) });

/** The closing blue card on every Help page. */
export const HELP_CONTACT = {
  id: "help-contact-title",
  title: "Still need help?",
  text: "Ask the EpicMKT team by phone, WhatsApp or email.",
  label: "Contact EpicMKT",
  to: routes.contact
};
