import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, RouterProvider, createMemoryRouter } from "react-router-dom";
import { setLatency } from "@epicmkt/backend";
import { blankItem, inspectMedia, sniffMedia, mediaCounterText } from "@epicmkt/shared";
import { png, jpeg, webp, mp4, heic, pad, disguised, hasMetadata } from "../../../shared/src/seller/media-fixtures.js";
import * as mock from "../api/mock.js";
import { Toaster } from "../ui/ui.jsx";
import { useToasts } from "../ui/toasts.js";
import { CatalogPage } from "../catalog/CatalogPage.jsx";
import { MediaManager } from "./MediaManager.jsx";
import { setMediaEngine } from "./engine.js";
import { bytesOf } from "./bytes.js";
import { resetMediaStore, timing, load as loadMedia } from "./mediaStore.js";

setLatency(0);

// A stand-in for the browser's canvas. It reads the size from the real bytes, then writes clean WebP files with no
// camera data, which is what the canvas re-encode does. (The real canvas is checked in a real browser, see e2e/.)
const fakeEngine = {
  canPlayType: () => "maybe",
  async decodeImage(file) {
    const info = inspectMedia(await bytesOf(file));
    if (!info.ok || info.kind !== "image") throw new Error("decode_failed");
    return { source: null, width: info.width, height: info.height };
  },
  async encode(d, { width }) {
    const height = Math.round((d.height * width) / d.width);
    return { blob: new Blob([webp(width, height)], { type: "image/webp" }), width, height, type: "image/webp", ext: "webp" };
  },
  async placeholder() { return "data:image/webp;base64,UklGRgAAAAA="; },
  async probeVideo(file) {
    const info = inspectMedia(await bytesOf(file));
    if (!info.ok || info.kind !== "video") throw new Error("probe_failed");
    return { duration: info.durationSec, width: info.width, height: info.height };
  },
  async captureFrame(_p, t) {
    return { blob: new Blob([webp(640, 360)], { type: "image/webp" }), type: "image/webp", ext: "webp", width: 640, height: 360, timeSec: t };
  },
};

const file = (bytes, name, type = "") => new File([bytes], name, { type });
const photo = (name = "a.jpg", w = 2400, h = 1600, o = {}) => file(jpeg(w, h, o), name, "image/jpeg");
const clip = (name = "v.mp4", seconds = 30) => file(mp4(1280, 720, seconds), name, "video/mp4");

const mountManager = async ({ plan = "standard", items = 1, extra = null } = {}) => {
  mock.setMockPlan(plan);
  const list = [];
  for (let i = 0; i < items; i++) list.push(await mock.createItem(blankItem({ name: `Item ${"AB"[i]}`, price: 100, sort: i, shortDescription: "ok" })));
  const ctx = await mock.getCatalogContext();
  const view = (item) => (
    <MediaManager key={item.id} itemId={item.id} itemName={item.name} itemSaved limits={ctx.mediaLimits} planKey={ctx.business.planKey} variants={[]} />
  );
  render(<MemoryRouter>{list.map(view)}<Toaster />{extra}</MemoryRouter>);
  return { list, ctx };
};
const sections = () => screen.getAllByRole("region", { name: "Photos and videos" });
const add = (files, which = 0) => fireEvent.change(within(sections()[which]).getByTestId("media-browse"), { target: { files } });
const cards = (which = 0) => [...sections()[which].querySelectorAll("[data-media]")];
const settle = async (n, which = 0) => waitFor(() => expect(cards(which).filter((c) => c.dataset.status !== undefined)).toHaveLength(n), { timeout: 4000 });
const counter = (which = 0) => within(sections()[which]).getByTestId("media-counter");

beforeEach(async () => {
  mock.resetMock();
  resetMediaStore();
  setMediaEngine(fakeEngine);
  timing.undoMs = 40; timing.lingerMs = 10;
  useToasts.getState().clear();
  let n = 0;
  URL.createObjectURL = () => `blob:test/${n++}`;
  URL.revokeObjectURL = () => {};
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  HTMLMediaElement.prototype.pause = () => {};
  HTMLMediaElement.prototype.load = () => {};
  await mock.login("ES100001", "Demo-Passw0rd");
});
afterEach(() => setMediaEngine(null));

describe("limits and counters", () => {
  test("Standard shows 7 photos and 1 video, and the counter follows uploads", async () => {
    await mountManager();
    expect(counter()).toHaveTextContent("0 of 7 photos, 0 of 1 video");
    add([photo("a.jpg"), clip()]);
    await waitFor(() => expect(counter()).toHaveTextContent("1 of 7 photos, 1 of 1 video"), { timeout: 4000 });
  });

  test("Premium shows 15 photos and 3 videos", async () => {
    await mountManager({ plan: "premium" });
    expect(counter()).toHaveTextContent("0 of 15 photos, 0 of 3 videos");
    expect(mediaCounterText({ photos: 3, videos: 0 }, { photos: 7, videos: 1 })).toBe("3 of 7 photos, 0 of 1 video");
  });

  test("the 8th photo on Standard is refused with an upgrade prompt; Premium says contact support", async () => {
    await mountManager();
    add(Array.from({ length: 8 }, (_, i) => photo(`p${i}.jpg`)));
    await waitFor(() => expect(mock.mockMediaRows().length).toBe(7), { timeout: 8000 });
    const prompt = await screen.findByTestId("media-limit");
    expect(prompt).toHaveTextContent("You have used all 7 photos");
    expect(within(prompt).getByRole("link", { name: "See Premium" })).toHaveAttribute("href", "/business/plan");
    expect(mock.mockMediaRows()).toHaveLength(7);
  });

  test("on Premium the limit prompt has no upgrade link", async () => {
    await mountManager({ plan: "premium" });
    add(Array.from({ length: 16 }, (_, i) => photo(`p${i}.jpg`, 1200, 900)));
    const prompt = await screen.findByTestId("media-limit", {}, { timeout: 10000 });
    expect(prompt).toHaveTextContent(/contact support/i);
    expect(within(prompt).queryByRole("link")).toBeNull();
  }, 20000);
});

describe("photos", () => {
  test("an upload makes every size, a placeholder, and the stored files carry no EXIF or GPS", async () => {
    await mountManager();
    const source = jpeg(2400, 1600, { exif: true });
    expect(hasMetadata(source)).toBe(true);
    add([file(source, "phone.jpg", "image/jpeg")]);
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(1), { timeout: 4000 });
    const [row] = mock.mockMediaRows();
    expect(Object.keys(row.variants).map(Number).sort((a, b) => a - b)).toEqual([320, 640, 960, 1280, 1600, 2000]);
    expect(row.placeholder).toMatch(/^data:image\/webp;base64,/);
    expect(row.path.split("/").slice(0, 3).join("/")).toContain(row.item_id);
    for (const [path, bytes] of mock.mockMediaFiles()) expect(hasMetadata(bytes), path).toBe(false);
  });

  test("a small source skips the sizes it cannot fill", async () => {
    await mountManager();
    add([photo("small.jpg", 900, 700)]);
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(1), { timeout: 4000 });
    const widths = Object.keys(mock.mockMediaRows()[0].variants).map(Number);
    expect(Math.max(...widths)).toBeLessThanOrEqual(900);
  });

  test("too small (under 600px) and too big (over 15 MB) are refused with a plain message", async () => {
    await mountManager();
    add([photo("tiny.jpg", 500, 400)]);
    expect(await screen.findByText(/at least 600/i)).toBeInTheDocument();
    const big = new Uint8Array(16 * 1024 * 1024);
    big.set(png(3000, 2000));
    add([file(big, "huge.png", "image/png")]);
    expect((await screen.findAllByText(/limit is 15 MB/i)).length).toBeGreaterThan(0);
    expect(mock.mockMediaRows()).toHaveLength(0);
  });

  test("a disguised file is refused whatever its name says", async () => {
    await mountManager();
    add([file(disguised.exe(), "holiday.jpg", "image/jpeg"), file(disguised.svg(), "logo.png", "image/png"), file(disguised.html(), "clip.mp4", "video/mp4")]);
    await waitFor(() => expect(sections()[0].querySelectorAll("[data-job][data-status='error']").length).toBe(3), { timeout: 4000 });
    expect(mock.mockMediaRows()).toHaveLength(0);
    expect(mock.mockMediaFiles().size).toBe(0);
  });

  test("HEIC gets a friendly message when the browser cannot open it", async () => {
    await mountManager();
    add([file(heic(), "IMG_1.heic", "image/heic")]);
    expect(await screen.findByText(/Most Compatible|export the photo as JPG/i)).toBeInTheDocument();
  });
});

describe("videos", () => {
  test("a 60 second video is refused", async () => {
    await mountManager();
    add([clip("long.mp4", 60)]);
    expect(await screen.findByText(/45 seconds/i)).toBeInTheDocument();
    expect(mock.mockMediaRows()).toHaveLength(0);
  });

  test("a valid video gets a poster, shows its length, and is ready", async () => {
    await mountManager();
    add([photo("a.jpg"), clip("tour.mp4", 30)]);
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(2), { timeout: 4000 });
    const video = mock.mockMediaRows().find((r) => r.kind === "video");
    expect(video.poster_path).toBeTruthy();
    expect(video.status).toBe("ready");
    const card = sections()[0].querySelector("[data-kind='video']");
    expect(within(card).getByText("0:30")).toBeInTheDocument();
  });

  test("an iPhone HEVC video is kept as Failed and never counts as ready", async () => {
    await mountManager();
    add([file(mp4(1280, 720, 10, { codec: "hevc" }), "iphone.mp4", "video/mp4")]);
    await waitFor(() => expect(sections()[0].textContent).toMatch(/HEVC|Failed/), { timeout: 4000 });
    const rows = mock.mockMediaRows();
    if (rows.length) expect(rows[0].status).toBe("failed");
  });
});

describe("order, cover and the shopper preview", () => {
  const openPreview = async (user, which = 0) => {
    await user.click(within(sections()[which]).getByRole("button", { name: "Preview gallery" }));
    return screen.findByTestId("gallery-preview");
  };

  test("reordering changes the order shoppers see in the preview", async () => {
    const user = userEvent.setup();
    await mountManager();
    add([photo("a.jpg", 2400, 1600), photo("b.jpg", 2000, 1500), photo("c.jpg", 1800, 1200)]);
    await settle(3);
    const ids = () => cards().map((c) => c.dataset.media);
    const before = ids();
    await user.click(within(cards()[2]).getByRole("button", { name: /Move Photo 3 earlier/ }));
    await waitFor(() => expect(ids()).toEqual([before[0], before[2], before[1]]));
    await waitFor(() => expect(mock.mockMediaRows().sort((a, b) => a.sort - b.sort).map((r) => r.id)).toEqual(ids()));
    const preview = await openPreview(user);
    const shown = [...preview.querySelectorAll("[data-slide]")].map((s) => s.dataset.mediaId);
    expect(shown.length).toBe(3);
    expect(shown).toEqual(ids());
  });

  test("the card cover is the first IMAGE even when a video is first", async () => {
    const user = userEvent.setup();
    await mountManager();
    add([photo("a.jpg"), photo("b.jpg", 2000, 1500), clip()]);
    await settle(3);
    const video = cards().find((c) => c.dataset.kind === "video");
    // Move the video to the front.
    await user.click(within(video).getByRole("button", { name: /Move Video \d earlier/ }));
    await user.click(within(cards().find((c) => c.dataset.kind === "video")).getByRole("button", { name: /Move Video \d earlier/ }));
    await waitFor(() => expect(cards()[0].dataset.kind).toBe("video"));
    const firstImage = cards().find((c) => c.dataset.kind === "image");
    expect(firstImage.dataset.cover).toBe("true");
    expect(cards()[0].dataset.cover).toBeUndefined();
    const preview = await openPreview(user);
    const cover = within(preview).getByTestId("preview-cover");
    expect(cover.getAttribute("src")).toBe(firstImage.querySelector("img").getAttribute("src"));
    // The gallery itself still opens on the video first, in order.
    expect(preview.querySelector("[data-slide]").dataset.mediaId).toBe(video.dataset.media);
  });

  test("videos never autoplay in the preview", async () => {
    const user = userEvent.setup();
    await mountManager();
    add([photo("a.jpg"), clip()]);
    await settle(2);
    const preview = await openPreview(user);
    for (const v of preview.querySelectorAll("video")) {
      expect(v.autoplay).toBe(false);
      expect(v.hasAttribute("autoplay")).toBe(false);
    }
  });

  test("Set cover moves a photo to the front", async () => {
    const user = userEvent.setup();
    await mountManager();
    add([photo("a.jpg"), photo("b.jpg", 2000, 1500)]);
    await settle(2);
    const second = cards()[1].dataset.media;
    await user.click(within(cards()[1]).getByRole("button", { name: /Set Photo 2 as cover/ }));
    await waitFor(() => expect(cards()[0].dataset.media).toBe(second));
    expect(cards()[0].dataset.cover).toBe("true");
  });

  test("media removed by an admin shows the reason, cannot be restored, and is left out of the preview", async () => {
    const user = userEvent.setup();
    const { list } = await mountManager();
    add([photo("a.jpg"), photo("b.jpg", 2000, 1500)]);
    await settle(2);
    mock.mockAdminRemoveMedia(cards()[0].dataset.media, "Contains a phone number");
    await act(async () => { await loadMedia(list[0].id, { force: true }); });
    const removed = cards().find((c) => c.dataset.status === "removed");
    expect(removed).toBeTruthy();
    expect(removed).toHaveTextContent("Removed by admin");
    expect(removed).toHaveTextContent("Contains a phone number");
    expect(within(removed).queryByRole("button", { name: /Replace|Set Photo/ })).toBeNull();
    expect(counter()).toHaveTextContent("1 of 7 photos");
    const preview = await openPreview(user);
    expect(preview.querySelectorAll("[data-slide]")).toHaveLength(1);
  });
});

describe("delete, replace and edit", () => {
  test("delete hides the card at once, Undo brings it back, and without Undo it is really deleted", async () => {
    const user = userEvent.setup();
    timing.undoMs = 5000;
    await mountManager();
    add([photo("a.jpg"), photo("b.jpg", 2000, 1500)]);
    await settle(2);
    await user.click(within(cards()[0]).getByRole("button", { name: /Delete Photo 1/ }));
    expect(cards()).toHaveLength(1);
    expect(counter()).toHaveTextContent("1 of 7 photos");
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(mock.mockMediaRows()).toHaveLength(2);

    timing.undoMs = 20;
    await user.click(within(cards()[0]).getByRole("button", { name: /Delete Photo 1/ }));
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(1), { timeout: 3000 });
    expect(cards()).toHaveLength(1);
    for (const path of mock.mockMediaFiles().keys()) expect(path).toContain(mock.mockMediaRows()[0].id);
  });

  test("alt text suggests 'Item name - view 2' and saves", async () => {
    const user = userEvent.setup();
    await mountManager();
    add([photo("a.jpg"), photo("b.jpg", 2000, 1500)]);
    await settle(2);
    await user.click(within(cards()[1]).getByRole("button", { name: /Details for Photo 2/ }));
    const alt = within(cards()[1]).getByLabelText("Alt text");
    expect(alt).toHaveAttribute("placeholder", "Item A - view 2");
    await user.click(within(cards()[1]).getByRole("button", { name: /Use “Item A - view 2”/ }));
    await waitFor(() => expect(mock.mockMediaRows().find((r) => r.id === cards()[1].dataset.media).alt).toBe("Item A - view 2"));
    await user.clear(alt);
    await user.type(alt, "x".repeat(130));
    expect(within(cards()[1]).getByText("Up to 120 characters")).toBeInTheDocument();
  });

  test("replace keeps the position and the media id, and frees the old files", async () => {
    const user = userEvent.setup();
    await mountManager();
    add([photo("a.jpg"), photo("b.jpg", 2000, 1500)]);
    await settle(2);
    const id = cards()[0].dataset.media;
    const before = mock.mockMediaRows().find((r) => r.id === id).path;
    await user.click(within(cards()[0]).getByRole("button", { name: /Replace Photo 1/ }));
    fireEvent.change(screen.getByTestId("media-replace-input"), { target: { files: [photo("new.jpg", 1600, 1600)] } });
    await waitFor(() => expect(mock.mockMediaRows().find((r) => r.id === id).path).not.toBe(before), { timeout: 4000 });
    expect(cards().map((c) => c.dataset.media)[0]).toBe(id);
    expect(mock.mockMediaRows()).toHaveLength(2);
    expect(mock.mockMediaFiles().has(before)).toBe(false);
  });
});

describe("drop zones and phones", () => {
  test("the dropzone shows a clear drag-over state for files and uploads a drop", async () => {
    await mountManager();
    const zone = within(sections()[0]).getByTestId("media-dropzone");
    expect(zone).toHaveAttribute("data-over", "false");
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"], files: [] } });
    expect(zone).toHaveAttribute("data-over", "true");
    expect(zone).toHaveTextContent("Drop to add");
    fireEvent.dragLeave(zone, { dataTransfer: { types: ["Files"] } });
    expect(zone).toHaveAttribute("data-over", "false");
    // Dragging text does not light it up.
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["text/plain"] } });
    expect(zone).toHaveAttribute("data-over", "false");
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [photo("dropped.jpg")] } });
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(1), { timeout: 4000 });
  });

  test("Take photo and Record video appear only on touch devices, with the camera hint", async () => {
    await mountManager();
    expect(screen.queryByRole("button", { name: /Take photo/ })).toBeNull();
    cleanup();
    mock.resetMock();
    resetMediaStore();
    window.matchMedia = (q) => ({ matches: /pointer: coarse/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
    await mock.login("ES100001", "Demo-Passw0rd");
    await mountManager();
    expect(screen.getByRole("button", { name: /Take photo/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record video/ })).toBeInTheDocument();
    expect(screen.getByTestId("media-capture-photo")).toHaveAttribute("capture");
    expect(screen.getByTestId("media-capture-video")).toHaveAttribute("capture");
    expect(screen.getByTestId("media-browse")).toHaveAttribute("multiple");
  });
});

describe("one item never shows another item's media", () => {
  test("two items side by side keep separate grids, counters and previews", async () => {
    const user = userEvent.setup();
    await mountManager({ items: 2 });
    add([photo("a1.jpg"), photo("a2.jpg", 2000, 1500)], 0);
    await waitFor(() => expect(cards(0)).toHaveLength(2), { timeout: 4000 });
    expect(cards(1)).toHaveLength(0);
    expect(counter(0)).toHaveTextContent("2 of 7 photos");
    expect(counter(1)).toHaveTextContent("0 of 7 photos");
    add([photo("b1.jpg")], 1);
    await waitFor(() => expect(cards(1)).toHaveLength(1), { timeout: 4000 });
    const idsA = new Set(cards(0).map((c) => c.dataset.media));
    expect(idsA.has(cards(1)[0].dataset.media)).toBe(false);
    await user.click(within(sections()[1]).getByRole("button", { name: "Preview gallery" }));
    const preview = await screen.findByTestId("gallery-preview");
    expect(preview.querySelectorAll("[data-slide]")).toHaveLength(1);
    for (const s of preview.querySelectorAll("[data-slide]")) expect(idsA.has(s.dataset.mediaId)).toBe(false);
  });
});
