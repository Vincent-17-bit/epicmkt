import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BrandStory, ItemImages } from "./ItemSections.jsx";

const pic = (n, extra = {}) => ({ url: `/g${n}.jpg`, srcSet: `/g${n}-800.jpg 800w, /g${n}-1600.jpg 1600w`, width: 1600, height: 900, label: "", caption: "", ...extra });

describe("Images", () => {
  it("lists every picture one under another, in the seller's order, each whole with its own size", () => {
    const item = { name: "Soundbar", galleryImages: [pic(1), pic(2, { width: 1080, height: 1350 }), pic(3)] };
    const { container } = render(<ItemImages item={item} />);
    expect(screen.getByRole("heading", { name: "Images" })).toBeInTheDocument();
    // No tabs, arrows or dots: a plain stack.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    const imgs = [...container.querySelectorAll("figure img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["/g1.jpg", "/g2.jpg", "/g3.jpg"]);
    expect(imgs[1]).toHaveAttribute("width", "1080");
    expect(imgs[1]).toHaveAttribute("height", "1350");
    expect(imgs[0]).toHaveAttribute("srcset", "/g1-800.jpg 800w, /g1-1600.jpg 1600w");
    expect(imgs.every((i) => i.getAttribute("loading") === "lazy")).toBe(true);
    // Pictures without words have no caption and nothing between them.
    expect(container.querySelectorAll("figcaption")).toHaveLength(0);
    expect(imgs[2]).toHaveAccessibleName("Soundbar, picture 3 of 3");
  });

  it("puts a picture's title and caption right under it", () => {
    const item = { name: "Soundbar", galleryImages: [pic(1, { label: "Cinematic mode", caption: "Film roars, lines stay crisp." }), pic(2, { label: "Vocal first" })] };
    const { container } = render(<ItemImages item={item} />);
    const [first, second] = container.querySelectorAll("figure");
    expect(within(first).getByText("Cinematic mode")).toBeInTheDocument();
    expect(within(first).getByText("Film roars, lines stay crisp.")).toBeInTheDocument();
    expect(within(first).getByRole("img")).toHaveAccessibleName("Film roars, lines stay crisp.");
    expect(within(second).getByRole("img")).toHaveAccessibleName("Vocal first");
  });

  it("skips a picture with no address and shows nothing when the seller added no pictures", () => {
    const { container, rerender } = render(<ItemImages item={{ name: "Soundbar", galleryImages: [pic(1), { url: "" }] }} />);
    expect(container.querySelectorAll("figure")).toHaveLength(1);
    rerender(<ItemImages item={{ name: "Soundbar", galleryImages: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("From the brand", () => {
  const story = [
    { group: "Info: Brand", label: "Soft, even slices", value: "Pre-sliced for convenience." },
    { group: "Info: Brand image", label: "Soft, even slices", value: "/a.jpg" }
  ];

  it("shows only the banner and the achievement cards, never the old story blocks", () => {
    const item = { name: "Bread", specs: story, images: [{ url: "/a.jpg" }], brandPage: { banner: { url: "/banner.jpg", srcSet: "" }, cards: [{ url: "/c1.jpg", srcSet: "", caption: "Gold winner 2025" }] } };
    render(<BrandStory item={item} />);
    expect(screen.getByRole("heading", { name: "From the brand" })).toBeInTheDocument();
    expect(screen.getByText("Gold winner 2025")).toBeInTheDocument();
    expect(screen.queryByText("Soft, even slices")).not.toBeInTheDocument();
    expect(screen.queryByText("Pre-sliced for convenience.")).not.toBeInTheDocument();
  });

  it("is left out when the brand has only story text", () => {
    const { container } = render(<BrandStory item={{ name: "Bread", specs: story, images: [{ url: "/a.jpg" }], brandPage: null }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
