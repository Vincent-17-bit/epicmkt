import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { BrandStory, ItemImages } from "./ItemSections.jsx";

const pic = (n, extra = {}) => ({ url: `/g${n}.jpg`, srcSet: `/g${n}-800.jpg 800w, /g${n}-1600.jpg 1600w`, width: 1600, height: 900, label: "", caption: "", ...extra });

describe("Images", () => {
  it("shows the pictures' names on a bar, the chosen one selected, and its caption", () => {
    const item = { name: "Soundbar", galleryImages: [pic(1, { label: "Cinematic mode", caption: "Film roars, lines stay crisp." }), pic(2, { label: "Vocal first" }), pic(3)] };
    render(<ItemImages item={item} />);
    const bar = screen.getByRole("tablist", { name: "Images" });
    const tabs = within(bar).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Cinematic mode", "Vocal first", "Image 3"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Film roars, lines stay crisp.")).toBeInTheDocument();
    fireEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    // Each picture is the panel of its name.
    expect(screen.getByRole("tabpanel", { name: "Image 3" })).toBeInTheDocument();
  });

  it("moves between names with the arrow keys, Home and End, and keeps focus on the chosen name", () => {
    const item = { name: "Soundbar", galleryImages: [pic(1, { label: "A" }), pic(2, { label: "B" }), pic(3, { label: "C" })] };
    render(<ItemImages item={item} />);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveFocus();
    // Only the chosen name is in the tab order.
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it("without names has no bar: arrows and dots move through the pictures instead", () => {
    const item = { name: "Soundbar", galleryImages: [pic(1), pic(2)] };
    const { container } = render(<ItemImages item={item} />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
    expect(container.querySelectorAll("[data-on]")).toHaveLength(1);
  });

  it("fills the frame only with a 16:9 picture; any other shape is shown whole", () => {
    const item = { name: "Soundbar", galleryImages: [pic(1), pic(2, { width: 2400, height: 900 }), pic(3, { width: 1000, height: 1000 })] };
    const { container } = render(<ItemImages item={item} />);
    const frames = [...container.querySelectorAll("figure > div")];
    expect(frames.map((f) => f.hasAttribute("data-fill"))).toEqual([true, false, false]);
    // A sharp size is chosen from srcset; the picture keeps its own size so it is never stretched.
    const img = frames[0].querySelector("img");
    expect(img).toHaveAttribute("srcset", "/g1-800.jpg 800w, /g1-1600.jpg 1600w");
    expect(img).toHaveAttribute("width", "1600");
    expect(img).toHaveAttribute("height", "900");
  });

  it("shows nothing when the seller added no pictures", () => {
    const { container } = render(<ItemImages item={{ name: "Soundbar", galleryImages: [] }} />);
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
