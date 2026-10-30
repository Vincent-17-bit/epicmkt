import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MediaGallery from "./MediaGallery.jsx";

const media = [
  { id: "i1", kind: "image", url: "https://x.test/1.jpg", caption: "One" },
  { id: "v1", kind: "video", url: "https://x.test/a.mp4", caption: "One", durationSec: 75 },
  { id: "i2", kind: "image", url: "https://x.test/2.jpg", caption: "Two" },
];

describe("MediaGallery", () => {
  it("lays photos and videos out as one track in the given order", () => {
    render(<MediaGallery media={media} name="Shoe" renderVideo={(v) => <span data-testid="vid">{v.id}</span>} />);
    const track = screen.getByRole("group", { name: "Shoe" });
    expect([...track.children].map((c) => c.getAttribute("aria-label") ?? c.textContent)).toEqual(["Zoom photo 1 / 2", "v1", "Zoom photo 2 / 2"]);
  });

  it("thumbnails count photos and videos on their own and show a video's length", () => {
    render(<MediaGallery media={media} name="Shoe" renderVideo={() => null} />);
    expect(screen.getAllByRole("button", { name: /^(Photo|Video) \d$/ }).map((b) => b.getAttribute("aria-label"))).toEqual(["Photo 1", "Video 1", "Photo 2"]);
    expect(screen.getByText("1:15")).toBeInTheDocument();
  });

  it("jumps straight to a tapped video thumbnail", () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
    render(<MediaGallery media={media} name="Shoe" renderVideo={() => null} />);
    fireEvent.click(screen.getByRole("button", { name: "Video 1" }));
    expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: "instant" });
    expect(screen.getByRole("button", { name: "Video 1" })).toHaveAttribute("aria-current", "true");
  });

  it("falls back to a link when no video renderer is given, and renders nothing without media", () => {
    const { container, rerender } = render(<MediaGallery media={media} name="Shoe" />);
    expect(within(container).getByRole("link", { name: "Video 1" })).toHaveAttribute("href", "https://x.test/a.mp4");
    rerender(<MediaGallery media={[]} name="Shoe" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows no thumbnails for a single item", () => {
    render(<MediaGallery media={[media[0]]} name="Shoe" />);
    expect(screen.queryByRole("list")).toBeNull();
  });
});
