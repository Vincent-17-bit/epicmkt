import { routes } from "./routes.js";

// Links the menu and the footer both show. Labels are i18n keys, read with t() where they render.
export const links = {
  about: { to: routes.about, labelKey: "nav.about" },
  contact: { to: routes.contact, labelKey: "nav.contact" },
  help: { to: routes.help, labelKey: "nav.help" },
  faq: { to: routes.faq, labelKey: "nav.faq" },
  howItWorks: { to: routes.howItWorks, labelKey: "nav.howItWorks" },
  reportProblem: { to: routes.reportProblem, labelKey: "nav.reportProblem" },
  suggestBusiness: { to: routes.suggestBusiness, labelKey: "nav.suggestBusiness" },
  apply: { to: routes.apply, labelKey: "nav.becomeASeller" },
  pricing: { to: routes.pricing, labelKey: "nav.pricing" },
  sellerGuide: { to: routes.sellerGuide, labelKey: "nav.sellerGuide" }
};

/** The small links under the menu's categories. */
export const infoLinks = [links.about, links.contact, links.faq];

/** The "For businesses" group in the footer. */
export const businessLinks = [links.apply, links.pricing, links.sellerGuide];

/** The "Help" group in the footer: each link has its own page. */
export const helpLinks = [links.faq, links.howItWorks, links.reportProblem, links.suggestBusiness];
