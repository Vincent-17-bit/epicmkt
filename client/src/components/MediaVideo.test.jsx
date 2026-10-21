import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MediaVideo from "./MediaVideo.jsx";

// jsdom does not play media. This stand-in records who was asked to play or pause, and fires the same `play` event a
// browser fires, which is what the "one at a time" rule listens to.
let play;
let pause;
const media = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
const device = ({ hover = true, reducedMotion = false } = {}) =>
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...media(query),
    matches: query.includes("hover: hover") ? hover : query.includes("prefers-reduced-motion") ? reducedMotion : false
  }));

// Pointer events by hand: jsdom's PointerEvent does not carry pointerType, and React reads it from the native event.
const pointer = (type, el, pointerType = "mouse") => {
  const event = new Event(type, { bubbles: true });
  event.pointerType = pointerType;
  act(() => {
    el.dispatchEvent(event);
  });
};
const hover = (el, pointerType) => pointer("pointerover", el, pointerType);
const unhover = (el, pointerType) => pointer("pointerout", el, pointerType);
const thumb = (label = "Watch video: Reel") => screen.getByRole("button", { name: label });
const videoIn = (el) => el.querySelector("video");

beforeEach(() => {
  play = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(function () {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(function () {
    this.dispatchEvent(new Event("pause"));
  });
  device();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MediaVideo: never autoplays, always starts muted", () => {
  it("never sets autoplay and never starts by itself", () => {
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    const video = videoIn(thumb());
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(video.autoplay).toBe(false);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(play).not.toHaveBeenCalled();
    // Scrolling it into view does not start it either.
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(play).not.toHaveBeenCalled();
  });

  it("is muted by default, in the thumbnail and in the player", async () => {
    const user = userEvent.setup();
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    expect(videoIn(thumb()).muted).toBe(true);
    await user.click(thumb());
    const dialog = screen.getByRole("dialog", { name: "Reel" });
    expect(videoIn(dialog).muted).toBe(true);
    expect(videoIn(dialog).hasAttribute("autoplay")).toBe(false);
  });

  it("unmuting needs a click on the sound button: playing does not unmute", async () => {
    device({ hover: false }); // a touch screen, so the only play() here is the tap on Play
    const user = userEvent.setup();
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    await user.click(thumb());
    const video = videoIn(screen.getByRole("dialog"));
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.contexts[0]).toBe(video);
    expect(video.muted).toBe(true);
    const sound = screen.getByRole("button", { name: "Turn sound on" });
    expect(sound).toHaveAttribute("aria-pressed", "false");
    await user.click(sound);
    expect(video.muted).toBe(false);
    expect(screen.getByRole("button", { name: "Turn sound off" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Turn sound off" }));
    expect(video.muted).toBe(true);
  });
});

describe("MediaVideo: hover preview", () => {
  it("hovering with a mouse starts a muted preview and leaving pauses it", () => {
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    const button = thumb();
    hover(button);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.contexts[0]).toBe(videoIn(button));
    expect(videoIn(button).muted).toBe(true);
    unhover(button);
    expect(pause).toHaveBeenCalled();
    expect(pause.mock.contexts.at(-1)).toBe(videoIn(button));
  });

  it("a touch screen has no hover behaviour", () => {
    device({ hover: false });
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    hover(thumb());
    expect(play).not.toHaveBeenCalled();
  });

  it("a finger touching a hover-capable laptop is not a hover either", () => {
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    hover(thumb(), "touch");
    expect(play).not.toHaveBeenCalled();
  });

  it("prefers-reduced-motion switches the hover preview off", () => {
    device({ hover: true, reducedMotion: true });
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    hover(thumb());
    expect(play).not.toHaveBeenCalled();
  });
});

describe("MediaVideo: the player", () => {
  it("a tap opens the player, which starts only when Play is tapped, and closing returns focus", async () => {
    device({ hover: false });
    const user = userEvent.setup();
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    await user.click(thumb());
    expect(screen.getByRole("dialog", { name: "Reel" })).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(thumb()).toHaveFocus();
  });

  it("opening the player stops a running hover preview", async () => {
    const user = userEvent.setup();
    render(<MediaVideo src="/v/a.mp4" label="Reel" />);
    const button = thumb();
    hover(button);
    await user.click(button);
    expect(pause.mock.contexts).toContain(videoIn(button));
  });
});

describe("MediaVideo: one at a time", () => {
  it("starting one video pauses the others", () => {
    render(
      <>
        <MediaVideo src="/v/a.mp4" label="One" />
        <MediaVideo src="/v/b.mp4" label="Two" />
      </>
    );
    const [one, two] = [thumb("Watch video: One"), thumb("Watch video: Two")];
    hover(one);
    pause.mockClear();
    hover(two);
    expect(play.mock.contexts).toEqual([videoIn(one), videoIn(two)]);
    expect(pause.mock.contexts).toContain(videoIn(one));
    expect(pause.mock.contexts).not.toContain(videoIn(two));
  });

  it("playing in the player pauses a video that is previewing elsewhere", async () => {
    const user = userEvent.setup();
    render(
      <>
        <MediaVideo src="/v/a.mp4" label="One" />
        <MediaVideo src="/v/b.mp4" label="Two" />
      </>
    );
    const one = thumb("Watch video: One");
    hover(one);
    await user.click(thumb("Watch video: Two"));
    pause.mockClear();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(pause.mock.contexts).toContain(videoIn(one));
  });
});
