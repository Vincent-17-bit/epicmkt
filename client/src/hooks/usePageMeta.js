import { useEffect } from "react";
import { SITE_URL } from "../config/breadcrumbs.js";

// Keeps the description, canonical link and share tags in step with the page on screen. The server (client/api/preview.js)
// already sends the right ones for crawlers; this covers in-app navigation, where the page changes without a reload and
// Googlebot, which does run JavaScript, reads the final head.
//
//   usePageMeta({ description, image, path })
//
// `path` is the canonical path, for example "/b/fade-kings". Pass nothing (or undefined) to leave the defaults alone.
export function usePageMeta(meta) {
  const description = meta?.description ?? "";
  const image = meta?.image ?? "";
  const path = meta?.path ?? "";

  useEffect(() => {
    if (!description && !image && !path) return undefined;
    const undo = [];
    const set = (selector, make, attr, value) => {
      if (!value) return;
      let el = document.head.querySelector(selector);
      const created = !el;
      if (created) {
        el = make();
        document.head.appendChild(el);
      }
      const before = el.getAttribute(attr);
      el.setAttribute(attr, value);
      undo.push(() => (created ? el.remove() : before === null ? el.removeAttribute(attr) : el.setAttribute(attr, before)));
    };
    const metaTag = (key, value) => () => {
      const el = document.createElement("meta");
      el.setAttribute(key, value);
      return el;
    };
    const link = () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    };
    const url = path ? `${SITE_URL}${path}` : "";
    const title = document.title;

    set('meta[name="description"]', metaTag("name", "description"), "content", description);
    set('meta[property="og:description"]', metaTag("property", "og:description"), "content", description);
    set('meta[name="twitter:description"]', metaTag("name", "twitter:description"), "content", description);
    set('meta[property="og:title"]', metaTag("property", "og:title"), "content", title);
    set('meta[name="twitter:title"]', metaTag("name", "twitter:title"), "content", title);
    set('meta[property="og:image"]', metaTag("property", "og:image"), "content", image);
    set('meta[name="twitter:image"]', metaTag("name", "twitter:image"), "content", image);
    set('meta[property="og:url"]', metaTag("property", "og:url"), "content", url);
    set('link[rel="canonical"]', link, "href", url);
    return () => undo.reverse().forEach((fn) => fn());
  }, [description, image, path]);
}
