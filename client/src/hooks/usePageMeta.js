import { useEffect } from "react";

function ensure(selector, create) {
  const existing = document.head.querySelector(selector);
  if (existing) return { node: existing, created: false };
  const node = create();
  document.head.appendChild(node);
  return { node, created: true };
}

export function usePageMeta({ description, canonical } = {}) {
  useEffect(() => {
    if (!description) return undefined;
    const { node, created } = ensure('meta[name="description"]', () => {
      const meta = document.createElement("meta");
      meta.name = "description";
      return meta;
    });
    const previous = node.getAttribute("content");
    node.setAttribute("content", description);
    return () => {
      if (created) node.remove();
      else if (previous !== null) node.setAttribute("content", previous);
    };
  }, [description]);

  useEffect(() => {
    if (!canonical) return undefined;
    const { node, created } = ensure('link[rel="canonical"]', () => {
      const link = document.createElement("link");
      link.rel = "canonical";
      return link;
    });
    const previous = node.getAttribute("href");
    node.setAttribute("href", canonical);
    return () => {
      if (created) node.remove();
      else if (previous !== null) node.setAttribute("href", previous);
    };
  }, [canonical]);
}
