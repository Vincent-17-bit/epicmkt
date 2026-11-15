import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { seriousViolations } from "../test/axe.js";
import ProductMedia from "./ProductMedia.jsx";

afterEach(cleanup);

const photos = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, kind: "image", url: `https://x.test/${i + 1}.jpg`, caption: `Photo ${i + 1}` }));
const clips = [
  { id: "v1", kind: "video", url: "https://x.test/a.mp4", poster: "https://x.test/a.jpg", caption: "Overview", duration: 8, by: "JBL Kenya" },
  { id: "v2", kind: "video", url: "https://x.test/b.mp4", caption: "Colours", duration: 65 }
];
const rail = () => within(screen.getByRole("list", { name: "Images" })).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

describe("ProductMedia (C07)", () => {
  it("shows a rail of photos, an N+ tile for the rest, and an N videos tile", () => {
    render(<ProductMedia name="JBL Flip 6" media={[...photos(9), ...clips]} />);
    expect(rail()).toEqual(["Photo 1 of 9", "Photo 2 of 9", "Photo 3 of 9", "Photo 4 of 9", "Photo 5 of 9", "4 more photos", "2 videos"]);
    expect(screen.getByRole("button", { name: "Click to see full view" })).toBeInTheDocument();
    expect(document.querySelector("video"), "no video plays on the page itself").toBeNull();
  });

  it("Click to see full view opens the viewer on IMAGES; the 4+ tile opens the fifth photo; Esc closes it", () => {
    render(<ProductMedia name="JBL Flip 6" media={[...photos(9), ...clips]} />);
    const opener = screen.getByRole("button", { name: "Click to see full view" });
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "JBL Flip 6: photos and videos" });
    expect(within(dialog).getByRole("tab", { name: "Images" })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("tab", { name: "Videos" })).toHaveAttribute("aria-selected", "false");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "4 more photos" }));
    const grid = within(screen.getByRole("dialog")).getAllByRole("button", { name: /^Photo \d of 9$/ });
    expect(grid.find((b) => b.getAttribute("aria-current") === "true")?.getAttribute("aria-label")).toBe("Photo 6 of 9");
  });

  it("the videos tile opens VIDEOS with the first video playing and a list to switch between them", () => {
    render(<ProductMedia name="JBL Flip 6" media={[...photos(2), ...clips]} />);
    fireEvent.click(screen.getByRole("button", { name: "2 videos" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("tab", { name: "Videos" })).toHaveAttribute("aria-selected", "true");
    const video = dialog.querySelector("video");
    expect(video).toHaveAttribute("src", "https://x.test/a.mp4");
    expect(video.autoplay).toBe(true);
    expect(video.controls).toBe(true);
    expect(within(dialog).getAllByText("JBL Kenya").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: /Colours/ }));
    expect(dialog.querySelector("video")).toHaveAttribute("src", "https://x.test/b.mp4");
    expect(within(dialog).getByText("1:05")).toBeInTheDocument();
  });

  it("arrow keys move between photos in the viewer, and switch tabs when a tab has focus", () => {
    render(<ProductMedia name="Mug" media={[...photos(3), clips[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Click to see full view" }));
    const dialog = screen.getByRole("dialog");
    const current = () => within(dialog).getAllByRole("button", { name: /^Photo \d of 3$/ }).find((b) => b.getAttribute("aria-current") === "true");
    expect(current()?.getAttribute("aria-label")).toBe("Photo 1 of 3");
    // Focus starts on the selected tab; on the photo itself the arrows move between photos.
    within(dialog).getByRole("button", { name: "Zoom in" }).focus();
    fireEvent.keyDown(document.activeElement, { key: "ArrowRight" });
    expect(current()?.getAttribute("aria-label")).toBe("Photo 2 of 3");
    fireEvent.keyDown(within(dialog).getByRole("tablist"), { key: "ArrowLeft" });
    expect(within(dialog).getByRole("tab", { name: "Videos" })).toHaveAttribute("aria-selected", "true");
  });

  it("an item with no photos and no videos shows no gallery", () => {
    const { container } = render(<ProductMedia name="Bare" media={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("has no serious accessibility problems, closed or open", async () => {
    const { container } = render(<ProductMedia name="JBL Flip 6" media={[...photos(6), ...clips]} />);
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Click to see full view" }));
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
