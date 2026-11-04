import { routes } from "./routes.js";

export const SITE_URL = (import.meta.env?.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");

export const SEARCH_QUERY_MAX = 24;

export const CASE_INSENSITIVE_PATHS = ["/flash", "/offers", "/featured"];

export const STATIC_TRAILS = {
  "/flash": [{ key: "breadcrumbs.flashSales" }],
  "/offers": [{ key: "breadcrumbs.offers" }],
  "/featured": [{ key: "breadcrumbs.featured" }],
  [routes.sell]: [{ key: "breadcrumb.sell" }],
  [routes.sellRegister]: [{ key: "breadcrumb.sell", to: routes.sell }, { key: "breadcrumb.register" }],
  [routes.pricing]: [{ key: "breadcrumb.pricing" }],
  [routes.sellerGuide]: [{ key: "breadcrumb.sellerGuide" }],
  "/about": [{ key: "breadcrumb.about" }],
  "/contact": [{ key: "breadcrumb.contact" }],
  [routes.help]: [{ key: "breadcrumb.help" }],
  [routes.faq]: [{ key: "breadcrumb.help", to: routes.help }, { key: "breadcrumb.faq" }],
  [routes.howItWorks]: [{ key: "breadcrumb.help", to: routes.help }, { key: "breadcrumb.howItWorks" }],
  [routes.reportProblem]: [{ key: "breadcrumb.help", to: routes.help }, { key: "breadcrumb.reportProblem" }],
  [routes.suggestBusiness]: [{ key: "breadcrumb.help", to: routes.help }, { key: "breadcrumb.suggestBusiness" }],
  "/privacy": [{ key: "breadcrumb.privacy" }],
  "/terms": [{ key: "breadcrumb.terms" }],
  "/cookies": [{ key: "breadcrumb.cookies" }]
};

export const RESULTS_KEY = "epicmkt.results";
