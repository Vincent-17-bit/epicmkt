import { useEffect } from "react";
import { SITE_URL } from "../config/breadcrumbs.js";
import { buildItemJsonLd } from "../lib/itemView.js";

const ID = "item-jsonld";

export function useItemJsonLd(item) {
  const key = item ? `${item.id}|${item.pricing?.salePrice}|${item.flash?.sale.endsAt ?? ""}|${item.availability}` : "";

  useEffect(() => {
    document.getElementById(ID)?.remove();
    if (!item) return undefined;
    const script = document.createElement("script");
    script.id = ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(buildItemJsonLd({ item, siteUrl: SITE_URL })).replace(/</g, "\\u003c");
    document.head.appendChild(script);
    return () => script.remove();
  }, [key]);
}
