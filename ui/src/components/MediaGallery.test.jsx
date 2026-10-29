import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaGallery from "./MediaGallery.jsx";

const photo = (n) => ({ id: `p${n}`, kind: "image", url: `https://x.test/${n}.jpg`, caption: `Photo ${n}` });
const video = (n, extra = {}) => ({ id: `v${n}`, kind: "video", url: `https://x.test/${n}.mp4`, ...extra });
// Seller order: photo, video, photo, video.
const mixed = [photo(1), video(1, { duration: 83 }), photo(2), video(2)];

let width;
let hover;
let reduced;
let scrollTo;
let play;
let pause;

beforeEach(() => {
  width = 400;
  hover = true;
  reduced = false;
  scrollTo = vi.fn();
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  HTMLElement.prototype.scrollTo = scrollTo;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => width });
  HTMLMediaElement.prototype.play = function () {
    play(this);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function () {
    pause(this);
    this.dispatchEvent(new Event("pause"));
  };
  window.matchMedia = vi.fn((query) => ({ matches: query.includes("hover: hover") ? hover : query.includes("reduced-motion") ? reduced : false, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  delete HTMLElement.prototype.scrollTo;
  delete HTMLElement.prototype.clientWidth;
});

const tabs = () => screen.getAllByRole("tab");
const stageVideos = (container) => [...container.querySelectorAll('[role="tabpanel"] video')];

describe("MediaGallery: order and structure", () => {
  it("shows photos and videos in one rail, in the seller's order", () => {
    const { container } = render(<MediaGallery media={mixed} name="Shoe" />);
    expect(tabs().map((tab) => tab.getAttribute("aria-label"))).toEqual(["Photo 1 of 4", "Video 2 of 4", "Photo 3 of 4", "Video 4 of 4"]);
    expect([...container.querySelectorAll("[data-kind]")].map((slide) => slide.dataset.kind)).toEqual(["image", "video", "image", "video"]);
  });

  it("adapts the old images[] + videos[] payload, photos first", () => {
    render(<MediaGallery images={[photo(1), photo(2)]} videos={[video(1)]} name="Shoe" />);
    expect(tabs().map((tab) => tab.getAttribute("aria-label"))).toEqual(["Photo 1 of 3", "Photo 2 of 3", "Video 3 of 3"]);
  });

  it("uses the carousel and tabs pattern", () => {
    render(<MediaGallery media={mixed} name="Shoe" />);
    expect(screen.getByRole("region", { name: "Shoe" })).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getByRole("tablist", { name: "Choose a photo or video" })).toBeInTheDocument();
    const [first, second] = tabs();
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveAttribute("aria-selected", "false");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Photo 1 of 4");
  });

  it("badges a video thumbnail with its length", () => {
    render(<MediaGallery media={mixed} name="Shoe" />);
    expect(within(tabs()[1]).getByText("1:23")).toBeInTheDocument();
    expect(within(tabs()[0]).queryByText(/:/)).toBeNull();
  });

  it("renders nothing without media, and no rail for a single photo", () => {
    const { container, rerender } = render(<MediaGallery media={[]} name="Shoe" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<MediaGallery media={[photo(1)]} name="Shoe" />);
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("MediaGallery: moving between slides", () => {
  it("jumps straight to a tapped thumbnail instead of scrolling past the ones between", () => {
    render(<MediaGallery media={mixed} name="Shoe" />);
    fireEvent.click(tabs()[3]);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 1200, behavior: "instant" });
    expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
  });

  it("follows a swipe", () => {
    const { container } = render(<MediaGallery media={mixed} name="Shoe" />);
    const track = container.querySelector("[data-kind]").parentElement;
    track.scrollLeft = 800;
    fireEvent.scroll(track);
    expect(tabs()[2]).toHaveAttribute("aria-selected", "true");
  });

  it("moves with the arrow keys, Home and End, and keeps focus on the rail", () => {
    render(<MediaGallery media={mixed} name="Shoe" />);
    tabs()[0].focus();
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs()[1]).toHaveFocus();
    fireEvent.keyDown(tabs()[1], { key: "ArrowDown" });
    expect(tabs()[2]).toHaveFocus();
    fireEvent.keyDown(tabs()[2], { key: "End" });
    expect(tabs()[3]).toHaveFocus();
    fireEvent.keyDown(tabs()[3], { key: "ArrowRight" });
    expect(tabs()[3]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs()[3], { key: "Home" });
    expect(tabs()[0]).toHaveFocus();
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(tabs()[0]).toHaveAttribute("aria-selected", "true");
  });

  it("announces the position politely", () => {
    const { container } = render(<MediaGallery media={mixed} name="Shoe" />);
    const live = container.querySelector("[aria-live]");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Photo 1 of 4");
    fireEvent.click(tabs()[1]);
    expect(live).toHaveTextContent("Video 2 of 4");
  });

  it("only the shown slide can be reached with Tab", () => {
    const { container } = render(<MediaGallery media={mixed} name="Shoe" />);
    const slides = [...container.querySelectorAll("[data-kind]")];
    expect(slides[0]).not.toHaveAttribute("inert");
    expect(slides[1]).toHaveAttribute("inert");
  });
});

describe("MediaGallery: video rules", () => {
  const openVideoFirst = () => {
    const utils = render(<MediaGallery media={[video(1), video(2), photo(1)]} name="Shoe" />);
    return { ...utils, videos: stageVideos(utils.container) };
  };

  it("never autoplays and starts muted", () => {
    const { videos } = openVideoFirst();
    expect(play).not.toHaveBeenCalled();
    videos.forEach((el) => {
      expect(el).not.toHaveAttribute("autoplay");
      expect(el.muted).toBe(true);
    });
  });

  it("plays only when the person taps Play, and playing does not unmute", () => {
    const { videos } = openVideoFirst();
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(videos[0].muted).toBe(true);
    expect(screen.getByRole("button", { name: "Pause video" })).toBeInTheDocument();
  });

  it("turns sound on only from the sound button", () => {
    const { videos } = openVideoFirst();
    fireEvent.click(screen.getByRole("button", { name: "Turn sound on" }));
    expect(videos[0].muted).toBe(false);
    expect(screen.getByRole("button", { name: "Turn sound off" })).toHaveAttribute("aria-pressed", "true");
  });

  it("pauses the video when the slide changes", () => {
    const { videos } = openVideoFirst();
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    pause.mockClear();
    fireEvent.click(tabs()[2]);
    expect(pause).toHaveBeenCalledWith(videos[0]);
  });

  it("lets only one video play at a time", () => {
    const { videos } = openVideoFirst();
    fireEvent.click(screen.getByRole("button", { name: "Play video" }));
    pause.mockClear();
    act(() => {
      videos[1].dispatchEvent(new Event("play"));
    });
    expect(pause).toHaveBeenCalledWith(videos[0]);
    expect(pause).not.toHaveBeenCalledWith(videos[1]);
  });

  it("previews on hover only with a hover pointer and no reduced-motion, and stops on leave", () => {
    const { container } = openVideoFirst();
    const frame = container.querySelector("video").parentElement;
    fireEvent.pointerEnter(frame, { pointerType: "mouse" });
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.pointerLeave(frame, { pointerType: "mouse" });
    expect(pause).toHaveBeenCalled();
  });

  it("does not preview on hover when reduced motion is on, on touch-only devices, or for a finger", () => {
    reduced = true;
    const first = openVideoFirst();
    fireEvent.pointerEnter(first.container.querySelector("video").parentElement, { pointerType: "mouse" });
    expect(play).not.toHaveBeenCalled();
    first.unmount();

    reduced = false;
    hover = false;
    const second = openVideoFirst();
    fireEvent.pointerEnter(second.container.querySelector("video").parentElement, { pointerType: "mouse" });
    expect(play).not.toHaveBeenCalled();
    second.unmount();

    hover = true;
    const third = openVideoFirst();
    const frame = third.container.querySelector("video").parentElement;
    const touch = new Event("pointerover", { bubbles: true });
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    frame.dispatchEvent(touch);
    expect(play).not.toHaveBeenCalled();
  });

  it("shows a friendly message when a video fails to load", () => {
    const { container } = openVideoFirst();
    fireEvent.error(container.querySelector("video"));
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("This video could not be loaded.");
  });
});

describe("MediaGallery: zoom", () => {
  it("opens the lightbox on a photo, over photos only", () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.removeAttribute("open");
    });
    render(<MediaGallery media={mixed} name="Shoe" />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom photo 1 / 4" }));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(document.querySelector("dialog figcaption")).toHaveTextContent("1 / 2");
  });
});
