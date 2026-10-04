import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { CASE_INSENSITIVE_PATHS, SITE_URL } from "../config/breadcrumbs.js";

const ID = "breadcrumb-jsonld";

export function buildJsonLd(trail, here) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.label,
      item: `${SITE_URL}${crumb.to ?? here}`
    }))
  };
}

export function useBreadcrumbJsonLd(trail) {
  const { pathname, search } = useLocation();
  const normal = pathname.replace(/\/+$/, "").toLowerCase();
  const here = CASE_INSENSITIVE_PATHS.includes(normal) ? normal : `${pathname}${search}`;
  const signature = trail.map((c) => `${c.label}|${c.to ?? ""}`).join(">");

  useEffect(() => {
    document.getElementById(ID)?.remove();
    if (trail.length < 2) return undefined;
    const script = document.createElement("script");
    script.id = ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(buildJsonLd(trail, here)).replace(/</g, "\\u003c");
    document.head.appendChild(script);
    return () => script.remove();
  }, [signature, pathname, search]);
}
