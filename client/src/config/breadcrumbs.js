export const SITE_URL = (import.meta.env?.VITE_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");

export const SEARCH_QUERY_MAX = 24;

export const CASE_INSENSITIVE_PATHS = ["/flash", "/offers"];

export const STATIC_TRAILS = {
  "/flash": [{ key: "breadcrumbs.flashSales" }],
  "/offers": [{ key: "breadcrumbs.offers" }],
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

export const ITEM_PATH = /^\/b\/([^/]+)\/item\/([^/]+)$/;

export const itemPath = (slug, itemId) => `/b/${encodeURIComponent(slug)}/item/${encodeURIComponent(itemId)}`;

export const parseItemPath = (pathname) => {
  const match = ITEM_PATH.exec(pathname.replace(/\/+$/, ""));
  if (!match) return null;
  try {
    return { slug: decodeURIComponent(match[1]), itemId: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
};
