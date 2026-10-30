import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { posterFromUrl, readVideo } from "./videoPoster.js";

let drawn;
let lastVideo;
let clip;

beforeEach(() => {
  drawn = [];
  clip = { duration: 12, videoWidth: 1280, videoHeight: 720, fail: false, seekable: true };
  URL.createObjectURL = vi.fn(() => "blob:clip");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: (...a) => drawn.push(a) });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function toBlob(cb, type, q) {
    cb(new Blob([`${this.width}x${this.height}`], { type }));
    drawn.push({ type, q });
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
  for (const key of ["duration", "videoWidth", "videoHeight"]) {
    Object.defineProperty(HTMLVideoElement.prototype, key, { configurable: true, get() { return clip[key]; } });
  }
  Object.defineProperty(HTMLVideoElement.prototype, "src", {
    configurable: true,
    get() { return this._src ?? ""; },
    set(v) {
      this._src = v;
      lastVideo = this;
      setTimeout(() => (clip.fail ? this.onerror?.() : this.onloadedmetadata?.()), 0);
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "currentTime", {
    configurable: true,
    get() { return this._t ?? 0; },
    set(v) {
      this._t = v;
      if (clip.seekable) setTimeout(() => this.onseeked?.(), 0);
    },
  });
});
afterEach(() => vi.restoreAllMocks());

describe("readVideo", () => {
  it("reads length and size and draws a poster frame at most 480 wide, then frees the object url", async () => {
    const info = await readVideo(new File(["x"], "a.mp4", { type: "video/mp4" }));
    expect(info).toMatchObject({ durationSec: 12, width: 1280, height: 720 });
    expect(info.poster).toBeInstanceOf(Blob);
    expect(info.poster.type).toBe("image/jpeg");
    expect(await info.poster.text()).toBe("480x270");
    expect(drawn[0]).toEqual([expect.anything(), 0, 0, 480, 270]);
    expect(lastVideo._t).toBeCloseTo(0.5);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip");
  });

  it("takes the frame from the middle of a very short clip", async () => {
    clip.duration = 0.4;
    await readVideo(new File(["x"], "a.mp4", { type: "video/mp4" }));
    expect(lastVideo._t).toBeCloseTo(0.2);
  });

  it("still returns the length when the canvas cannot be used", async () => {
    HTMLCanvasElement.prototype.getContext.mockReturnValue(null);
    const info = await readVideo(new File(["x"], "a.mp4", { type: "video/mp4" }));
    expect(info.poster).toBeNull();
    expect(info.durationSec).toBe(12);
  });

  it("still returns a result when the seek never completes", async () => {
    clip.seekable = false;
    vi.useFakeTimers();
    const pending = readVideo(new File(["x"], "a.mp4", { type: "video/mp4" }));
    await vi.advanceTimersByTimeAsync(5000);
    const info = await pending;
    vi.useRealTimers();
    expect(info.durationSec).toBe(12);
  });

  it("rejects with video_unplayable when the browser cannot decode it, and frees the url", async () => {
    clip.fail = true;
    await expect(readVideo(new File(["x"], "a.mov", { type: "video/quicktime" }))).rejects.toMatchObject({ code: "video_unplayable" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:clip");
  });

  it("rejects with video_unplayable when the length is unknown", async () => {
    clip.duration = NaN;
    await expect(readVideo(new File(["x"], "a.mp4", { type: "video/mp4" }))).rejects.toMatchObject({ code: "video_unplayable" });
  });
});

describe("posterFromUrl", () => {
  it("draws a poster for a saved video and asks for cross origin access", async () => {
    const blob = await posterFromUrl("https://cdn.test/v.mp4");
    expect(blob).toBeInstanceOf(Blob);
    expect(lastVideo.crossOrigin).toBe("anonymous");
  });

  it("returns null instead of throwing when the video cannot be loaded", async () => {
    clip.fail = true;
    expect(await posterFromUrl("https://cdn.test/v.mp4")).toBeNull();
  });
});
