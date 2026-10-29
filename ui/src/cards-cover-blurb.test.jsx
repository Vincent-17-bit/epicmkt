import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ItemCard from "./ItemCard.jsx";
import ProductTile from "./ProductTile.jsx";
import ProductCard from "./components/ProductCard.jsx";

const base = { id: "1", name: "Clipper", imageUrl: "list.jpg", pricing: { salePrice: 100, regularPrice: 100, savings: 0 }, business: { name: "Shop" }, availability: "available" };
const withMedia = { ...base, media: [{ id: "v", kind: "video", url: "v.mp4", poster: "poster.jpg" }, { id: "i", kind: "image", url: "https://x.test/first.jpg" }] };
const cards = [
  ["ItemCard", (item) => <ItemCard item={item} />],
  ["ProductCard", (item) => <ProductCard item={item} />],
  ["ProductTile", (item) => <ProductTile item={item} href="/x" />]
];

describe.each(cards)("%s cover and short description", (_name, make) => {
  it("covers with the first photo, never a video", () => {
    const { container } = render(make(withMedia));
    expect(container.querySelector("img").getAttribute("src")).toContain("first.jpg");
    expect(container.innerHTML).not.toContain("poster.jpg");
  });
  it("shows the short description", () => {
    const { container } = render(make({ ...base, shortDescription: "Quiet and cordless", description: "Other words. More." }));
    expect(container.textContent).toContain("Quiet and cordless");
    expect(container.textContent).not.toContain("Other words");
  });
  it("falls back to the first sentence of the description when the short one is empty", () => {
    const { container } = render(make({ ...base, shortDescription: "  ", description: "Cordless trimmer with a steel blade. Comes boxed. Two year warranty." }));
    expect(container.textContent).toContain("Cordless trimmer with a steel blade.");
    expect(container.textContent).not.toContain("Comes boxed");
  });
});

describe("two-line clamp", () => {
  it("is declared in the card stylesheets", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const file of ["ItemCard.module.css", "components/ProductCard.module.css"]) {
      const css = fs.readFileSync(path.resolve(process.cwd(), process.cwd().endsWith("ui") ? "src" : "ui/src", file), "utf8");
      expect(css).toMatch(/\.blurb\s*{[^}]*-webkit-line-clamp:\s*2/);
    }
  });
});
