import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { CASE_INSENSITIVE_PATHS, SITE_URL } from "../config/breadcrumbs.js";
import { PAGE_DESCRIPTIONS, isNoindexPath } from "../config/pageMeta.js";

// Sets (or finds) one tag in the head and returns a function that puts it back as it was.
function setTag(selector, create, attr, value) {
  if (!value) return () => {};
  let el = document.head.querySelector(selector);
  const created = !el;
  if (created) {
    el = create();
    document.head.appendChild(el);
  }
  const before = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => (created ? el.remove() : before === null ? el.removeAttribute(attr) : el.setAttribute(attr, before));
}

const meta = (key, name) => () => {
  const el = document.createElement("meta");
  el.setAttribute(key, name);
  return el;
};
const canonicalLink = () => {
  const el = document.createElement("link");
  el.setAttribute("rel", "canonical");
  return el;
};

// The path search engines should treat as this page's address: no query, no trailing slash, and the lowercase form for
// the pages that answer to any capitalisation (/Flash is /flash).
export function canonicalPath(pathname) {
  let path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (CASE_INSENSITIVE_PATHS.includes(path.toLowerCase())) path = path.toLowerCase();
  return path || "/";
}

// Marks the page "noindex" while mounted. Used for pages that must stay out of search results.
export function useNoindex(on = true) {
  useEffect(() => {
    if (!on) return undefined;
    return setTag('meta[name="robots"]', meta("name", "robots"), "content", "noindex, follow");
  }, [on]);
}

// Keeps the address, description and noindex flag in step with the page on screen. index.html cannot carry a fixed canonical
// (it would name the homepage for every page), so this sets the right one on each navigation. Store and item pages are set the
// same way here and again, with richer text, by usePageMeta and by the server (client/api/preview.js).
export function useRouteSeo() {
  const { pathname } = useLocation();
  const path = canonicalPath(pathname);
  const description = PAGE_DESCRIPTIONS[path.toLowerCase()] ?? "";
  const noindex = isNoindexPath(path);

  useNoindex(noindex);

  useEffect(() => {
    const url = `${SITE_URL}${path === "/" ? "/" : path}`;
    const undo = [
      setTag('link[rel="canonical"]', canonicalLink, "href", url),
      setTag('meta[property="og:url"]', meta("property", "og:url"), "content", url)
    ];
    if (description) {
      // The page's own title is already set by now (children run their effects first), so share titles match it.
      const title = document.title;
      undo.push(
        setTag('meta[name="description"]', meta("name", "description"), "content", description),
        setTag('meta[property="og:description"]', meta("property", "og:description"), "content", description),
        setTag('meta[name="twitter:description"]', meta("name", "twitter:description"), "content", description),
        setTag('meta[property="og:title"]', meta("property", "og:title"), "content", title),
        setTag('meta[name="twitter:title"]', meta("name", "twitter:title"), "content", title)
      );
    }
    return () => undo.reverse().forEach((fn) => fn());
  }, [path, description]);
}
