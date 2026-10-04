import { CASE_INSENSITIVE_PATHS, SEARCH_QUERY_MAX, STATIC_TRAILS } from "../config/breadcrumbs.js";
import { t as translate } from "../i18n/index.js";

const HOME = (t) => ({ key: "home", label: t("breadcrumb.home"), to: "/", icon: "house" });

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const none = { status: "none", trail: [], invalidItem: false };
const loading = { status: "loading", trail: [], invalidItem: false };
const notFound = { status: "not-found", trail: [], invalidItem: false };

const categoryCrumb = (category) => ({ key: `c-${category.id}`, label: category.name, to: `/c/${category.id}` });

const townCrumb = (category, town) => ({
  key: `t-${town.slug}`,
  label: town.name,
  to: `/c/${category.id}?town=${encodeURIComponent(town.slug)}`
});

export function getTrail({ pathname, search = "", categories, towns, business, t = translate }) {
  const path = pathname.replace(/\/+$/, "") || "/";
  const params = new URLSearchParams(search);
  const home = HOME(t);

  if (path === "/") return none;

  const lower = path.toLowerCase();
  const staticTrail = STATIC_TRAILS[CASE_INSENSITIVE_PATHS.includes(lower) ? lower : path];
  if (staticTrail) {
    const trail = staticTrail.map((c) => ({ key: c.key, label: t(c.key), ...(c.to ? { to: c.to } : {}) }));
    return { status: "ready", trail: [home, ...trail], invalidItem: false };
  }

  if (path === "/search") {
    const q = (params.get("q") ?? "").trim();
    const label = q ? `${t("breadcrumb.search")}: "${clip(q, SEARCH_QUERY_MAX)}"` : t("breadcrumb.search");
    return { status: "ready", trail: [home, { key: "search", label }], invalidItem: false };
  }

  const categoryMatch = /^\/c\/([^/]+)$/.exec(path);
  if (categoryMatch) {
    const slug = decodeURIComponent(categoryMatch[1]);
    if (categories.status === "pending") return loading;
    const category = categories.data?.find((c) => c.id === slug);
    if (!category) return notFound;
    const townSlug = params.get("town");
    if (!townSlug) return { status: "ready", trail: [home, { key: `c-${category.id}`, label: category.name }], invalidItem: false };
    if (towns.status === "pending") return loading;
    const town = towns.data?.find((x) => x.slug === townSlug);
    if (!town) return { status: "ready", trail: [home, { key: `c-${category.id}`, label: category.name }], invalidItem: false };
    return { status: "ready", trail: [home, categoryCrumb(category), { key: `t-${town.slug}`, label: town.name }], invalidItem: false };
  }

  const businessMatch = /^\/b\/([^/]+)$/.exec(path);
  if (businessMatch) {
    if (business.status === "pending" || categories.status === "pending") return loading;
    if (business.status === "error" || !business.data) return notFound;
    const biz = business.data;
    const category = categories.data?.find((c) => c.id === biz.categoryId);
    const trail = [home];
    if (category) trail.push(categoryCrumb(category));
    if (category && biz.townSlug && biz.area) trail.push(townCrumb(category, { slug: biz.townSlug, name: biz.area }));

    const itemId = params.get("item");
    const item = itemId ? biz.services?.find((svc) => svc.id === itemId) : null;
    const invalidItem = Boolean(itemId) && !item;

    if (item) {
      trail.push({ key: `b-${biz.id}`, label: biz.name, to: `/b/${biz.slug}` });
      trail.push({ key: `i-${item.id}`, label: item.name });
    } else {
      trail.push({ key: `b-${biz.id}`, label: biz.name });
    }
    return { status: "ready", trail, invalidItem };
  }

  return none;
}

export function pageTitle(trail) {
  const names = trail.slice(1).map((c) => c.label);
  return names.length ? names.reverse().join(" | ") : "";
}
