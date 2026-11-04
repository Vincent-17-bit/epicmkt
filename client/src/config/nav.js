import { routes } from "./routes.js";

// Links the menu and the footer both show. Labels are i18n keys, read with t() where they render.
export const links = {
  about: { to: "/about", labelKey: "nav.about" },
  contact: { to: "/contact", labelKey: "nav.contact" },
  faq: { to: "/faq", labelKey: "nav.faq" },
  apply: { to: routes.apply, labelKey: "nav.becomeASeller" },
  pricing: { to: routes.pricing, labelKey: "nav.pricing" },
  sellerGuide: { to: routes.sellerGuide, labelKey: "nav.sellerGuide" }
};

/** The small links under the menu's categories. */
export const infoLinks = [links.about, links.contact, links.faq];

/** The "For businesses" group in the footer. */
export const businessLinks = [links.apply, links.pricing, links.sellerGuide];
