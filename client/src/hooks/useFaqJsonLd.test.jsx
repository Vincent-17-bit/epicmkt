import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildFaqJsonLd, useFaqJsonLd } from "./useFaqJsonLd.js";

const items = [{ q: "Is it free?", a: "Yes <b>always</b>." }];

function Probe() {
  useFaqJsonLd(items);
  return null;
}

describe("useFaqJsonLd", () => {
  it("builds a FAQPage with one question per item", () => {
    const ld = buildFaqJsonLd(items);
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "Is it free?", acceptedAnswer: { "@type": "Answer", text: "Yes <b>always</b>." } });
  });

  it("adds the script while mounted, escapes <, and removes it on unmount", () => {
    const { unmount } = render(<Probe />);
    const script = document.getElementById("faq-jsonld");
    expect(script).not.toBeNull();
    expect(script.textContent).not.toContain("<b>");
    expect(JSON.parse(script.textContent).mainEntity[0].acceptedAnswer.text).toBe("Yes <b>always</b>.");
    unmount();
    expect(document.getElementById("faq-jsonld")).toBeNull();
  });
});
