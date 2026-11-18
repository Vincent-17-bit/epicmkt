import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildSpecGroups, cleanLead, normalizeHighlights } from "./itemView.js";
import ItemDetails from "./ItemDetails.jsx";
import ItemSpecs from "./ItemSpecs.jsx";

describe("About this item: bold leads in brackets", () => {
  it("takes off what sellers type around the lead (bullets, brackets, a last colon)", () => {
    expect(["• Freshness Guaranteed:", "[Fast charging]", "【Impactful Volume Boost】", "Big sound -", "★ Made in Kenya："].map(cleanLead))
      .toEqual(["Freshness Guaranteed", "Fast charging", "Impactful Volume Boost", "Big sound", "Made in Kenya"]);
    expect(normalizeHighlights([{ title: "• Perfectly Sliced:", text: ": Evenly sliced." }])).toEqual([{ title: "Perfectly Sliced", text: "Evenly sliced." }]);
  });

  it("draws the lead once, bold and in brackets, then a colon and the text", () => {
    render(<ItemDetails item={{ highlights: [{ title: "【Epic Cinema Audio】", text: "80W output." }, { text: "No lead here." }] }} />);
    const lead = screen.getByText("【Epic Cinema Audio】");
    expect(lead.tagName).toBe("STRONG");
    expect(lead.closest("li").textContent).toBe("【Epic Cinema Audio】: 80W output.");
    expect(screen.getByText("No lead here.").textContent).toBe("No lead here.");
  });
});

describe("specifications and what's included", () => {
  it("shows '• Dietary Claims:' as 'Dietary Claims'", () => {
    const groups = buildSpecGroups({ item: { specs: [{ group: "Item details", label: "• Dietary Claims:", value: "Vegetarian" }] } });
    expect(groups[0].rows[0]).toEqual({ label: "Dietary Claims", value: "Vegetarian" });
  });

  it("leaves What's included to its own section on the page (not repeated among the specs)", () => {
    render(<ItemSpecs item={{ includes: ["Soundbar", "Remote"], includePhotos: [null, "https://img.test/remote.jpg"], terms: "Returns within 7 days" }} />);
    expect(screen.queryByText("Remote")).not.toBeInTheDocument();
  });

  it("shows the seller's notes in a box right under About this item, with the tone in words", () => {
    render(<ItemDetails item={{ id: "a", highlights: [{ title: "Lead", text: "Point" }], description: "Long text", notices: [{ tone: "caution", title: "Product voltage: 240 V", text: "Use a converter on 110 V." }, { tone: "loud", title: "", text: "" }] }} />);
    const note = screen.getByRole("region", { name: /^Check before buying: Product voltage: 240 V$/ });
    expect(note).toHaveTextContent("Use a converter on 110 V.");
    expect(screen.getAllByRole("region", { name: /^(Note|Check before buying|Warning):/ })).toHaveLength(1);
    // It sits after the highlights and before the description.
    const about = screen.getByText("Point");
    const desc = screen.getByText("Long text");
    expect(about.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
