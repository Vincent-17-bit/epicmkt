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

  it("shows a photo next to an included line that has one", () => {
    const { container } = render(<ItemSpecs item={{ includes: ["Soundbar", "Remote"], includePhotos: [null, "https://img.test/remote.jpg"] }} />);
    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect([...container.querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual(["https://img.test/remote.jpg"]);
  });
});
