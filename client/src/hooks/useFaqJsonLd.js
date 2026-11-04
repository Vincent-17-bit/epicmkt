import { useEffect } from "react";

const ID = "faq-jsonld";

/** items: [{ q, a }] with plain-text answers, so the markup says exactly what the page says. */
export function buildFaqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
}

/** Adds the FAQPage script to the head while the page is open, and removes it when the page closes. */
export function useFaqJsonLd(items) {
  useEffect(() => {
    document.getElementById(ID)?.remove();
    if (!items.length) return undefined;
    const script = document.createElement("script");
    script.id = ID;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(buildFaqJsonLd(items)).replace(/</g, "\\u003c");
    document.head.appendChild(script);
    return () => script.remove();
  }, [items]);
}
