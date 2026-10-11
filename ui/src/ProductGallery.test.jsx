import { describe, test, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { ProductGallery } from "./index.js";

const photos = [
  { id: "a", url: "/a.webp" },
  { id: "b", url: "/b.webp" },
  { id: "c", url: "/c.webp" },
];
const video = { id: "v", kind: "video", url: "/v.mp4", poster: "/poster.webp", durationSec: 75, alt: "Demo clip" };

describe("ProductGallery: photos only", () => {
  test("renders a zoom button and a thumbnail per photo, the way it always has", () => {
    render(<ProductGallery images={photos} name="Shirt" />);
    expect(screen.getByRole("group", { name: "Shirt" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Zoom photo/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Photo \d$/ })).toHaveLength(3);
    expect(document.querySelector("video")).toBeNull();
  });

  test("one photo has no thumbnails, and no photos renders nothing", () => {
    const { container, rerender } = render(<ProductGallery images={photos.slice(0, 1)} name="Shirt" />);
    expect(screen.queryByRole("button", { name: /^Photo/ })).not.toBeInTheDocument();
    rerender(<ProductGallery images={[]} name="Shirt" />);
    expect(container).toBeEmptyDOMElement();
  });

  test("responsive sources are passed through only when given", () => {
    render(<ProductGallery images={[{ id: "a", url: "/a.webp", srcSet: "/a320.webp 320w, /a640.webp 640w", sizes: "100vw" }, { id: "b", url: "/b.webp" }]} name="Shirt" />);
    const [first, second] = document.querySelectorAll("button[aria-label^='Zoom'] img");
    expect(first).toHaveAttribute("srcset", "/a320.webp 320w, /a640.webp 640w");
    expect(second).not.toHaveAttribute("srcset");
  });
});

describe("ProductGallery: videos", () => {
  test("a video shows its poster with controls, never autoplays and loads nothing until asked", () => {
    render(<ProductGallery images={[video, ...photos]} name="Shirt" />);
    const el = document.querySelector("video");
    expect(el).toHaveAttribute("poster", "/poster.webp");
    expect(el).toHaveAttribute("controls");
    expect(el).toHaveAttribute("preload", "none");
    expect(el).not.toHaveAttribute("autoplay");
    expect(el.autoplay).toBe(false);
    expect(el).toHaveAttribute("aria-label", "Demo clip");
  });

  test("the video thumbnail shows a play badge and its length, in the gallery's order", () => {
    render(<ProductGallery images={[photos[0], video, photos[1]]} name="Shirt" />);
    const thumbs = within(screen.getByRole("list")).getAllByRole("button");
    expect(thumbs.map((t) => t.getAttribute("aria-label"))).toEqual(["Photo 1", "Video 2", "Photo 3"]);
    expect(within(thumbs[1]).getByText("1:15")).toBeInTheDocument();
    expect(thumbs[1]).toHaveAttribute("data-kind", "video");
  });

  test("zoom opens photos only, and lands on the photo that was tapped even when a video comes first", () => {
    render(<ProductGallery images={[video, photos[0], photos[1]]} name="Shirt" />);
    expect(screen.getAllByRole("button", { name: /Zoom photo/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Zoom photo 3 / 3" }));
    const open = document.querySelector("dialog[open] img");
    expect(open).toHaveAttribute("src", "/b.webp");
  });

  test("zoom uses the larger picture when there is one", () => {
    render(<ProductGallery images={[{ id: "a", url: "/a1600.webp", zoomUrl: "/a2000.webp" }]} name="Shirt" />);
    fireEvent.click(screen.getByRole("button", { name: /Zoom photo/ }));
    expect(document.querySelector("dialog[open] img")).toHaveAttribute("src", "/a2000.webp");
  });

  test("a video only item still renders", () => {
    render(<ProductGallery images={[video]} name="Shirt" />);
    expect(document.querySelector("video")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zoom/ })).not.toBeInTheDocument();
  });

  test("moving to another slide pauses a playing video", () => {
    render(<ProductGallery images={[video, photos[0]]} name="Shirt" />);
    const el = document.querySelector("video");
    const pause = vi.fn();
    el.pause = pause;
    fireEvent.click(screen.getByRole("button", { name: "Photo 2" }));
    expect(pause).toHaveBeenCalled();
  });
});
