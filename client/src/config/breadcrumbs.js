export const SITE_URL = (import.meta.env?.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");

export const SEARCH_QUERY_MAX = 24;

export const STATIC_TRAILS = {
  "/flash": [{ key: "breadcrumb.flash" }],
  "/sell": [{ key: "breadcrumb.sell" }],
  "/sell/register": [{ key: "breadcrumb.sell", to: "/sell" }, { key: "breadcrumb.register" }],
  "/about": [{ key: "breadcrumb.about" }],
  "/contact": [{ key: "breadcrumb.contact" }],
  "/faq": [{ key: "breadcrumb.faq" }],
  "/privacy": [{ key: "breadcrumb.privacy" }],
  "/terms": [{ key: "breadcrumb.terms" }],
  "/cookies": [{ key: "breadcrumb.cookies" }]
};

export const RESULTS_KEY = "epicmkt.results";
