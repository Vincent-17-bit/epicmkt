import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import * as mock from "../../api/mock.js";
import MediaManager from "./MediaManager.jsx";
import useMediaManager from "./useMediaManager.js";

const clips = vi.hoisted(() => ({ info: {}, poster: new Blob(["p"], { type: "image/jpeg" }) }));
vi.mock("../../lib/videoPoster.js", () => ({
  readVideo: vi.fn(async (file) => {
    const info = clips.info[file.name] ?? { durationSec: 12, width: 640, height: 360 };
    if (info.error) throw Object.assign(new Error(info.error), { code: info.error });
    return { ...info, poster: clips.poster };
  }),
  posterFromUrl: vi.fn(async () => null),
}));

const M = mock.__mock;
let manager;
let n;

const png = (name, side = 300) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, side);
  new DataView(b.buffer).setUint32(20, side);
  return new File([b], name, { type: "image/png" });
};
const mp4 = (name, size = 20) => new File([new Uint8Array(size)], name, { type: "video/mp4" });

function Host({ itemId = null, limits = { photos: 10, videos: 2 }, disabled = false }) {
  manager = useMediaManager({ itemId, limits });
  return <MediaManager manager={manager} hasItem={Boolean(itemId)} disabled={disabled} />;
}

const input = () => screen.getByTestId("media-input");
const tiles = () => [...document.querySelectorAll("[data-tile]")];
const labels = () => tiles().map((t) => t.getAttribute("aria-label"));
const kinds = () => tiles().map((t) => t.dataset.kind);
const live = () => screen.getByTestId("media-live").textContent;
const add = async (user, ...files) => {
  await user.upload(input(), files);
  await waitFor(() => expect(screen.queryByText("Checking files...")).toBeNull());
};

beforeEach(async () => {
  n = 0;
  URL.createObjectURL = vi.fn(() => `blob:m-${++n}`);
  URL.revokeObjectURL = vi.fn();
  mock.resetMock();
  await api.login("ES100001", "Demo-Passw0rd");
  clips.info = {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("adding", () => {
  it("shows photos and videos in one grid in the order they were added, with Cover, Video and duration badges", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await add(user, png("a.png"), mp4("clip.mp4"), png("b.png"));
    expect(kinds()).toEqual(["image", "video", "image"]);
    expect(labels()).toEqual(["Photo 1", "Video 2", "Photo 3"]);
    expect(within(tiles()[0]).getByText("Cover")).toBeInTheDocument();
    expect(within(tiles()[1]).getByText("Video 0:12")).toBeInTheDocument();
    expect(screen.getAllByText("Uploads on save")).toHaveLength(3);
    expect(screen.getByTestId("media-summary")).toHaveTextContent("2 of 10 photos, 1 of 2 videos");
  });

  it("generates a poster frame for a video and shows a play badge instead of a raw video element", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await add(user, mp4("clip.mp4"));
    const tile = tiles()[0];
    expect(tile.querySelector("img")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
    expect(document.querySelector("[data-tile] video")).toBeNull();
    expect(within(tile).getByRole("button", { name: "Preview video 1" })).toBeInTheDocument();
  });

  it("opens a small player when a video tile is tapped", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await add(user, mp4("clip.mp4"));
    await user.click(screen.getByRole("button", { name: "Preview video 1" }));
    const player = await screen.findByLabelText("Video preview", { selector: "video" });
    expect(player).toHaveAttribute("controls");
    expect(player.getAttribute("src")).toMatch(/^blob:/);
  });

  it("accepts files pasted from the clipboard and dropped onto the area", async () => {
    render(<Host />);
    const pasted = png("pasted.png");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    event.clipboardData = { files: [pasted] };
    act(() => { document.body.dispatchEvent(event); });
    await waitFor(() => expect(tiles()).toHaveLength(1));
    const dropped = mp4("dropped.mp4");
    fireEvent.drop(screen.getByTestId("media-summary").parentElement, { dataTransfer: { files: [dropped], types: ["Files"] } });
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(kinds()).toEqual(["image", "video"]);
  });

  it("ignores a paste into a text field", async () => {
    render(<><input aria-label="Name" /><Host /></>);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    event.clipboardData = { files: [png("p.png")] };
    act(() => { screen.getByLabelText("Name").dispatchEvent(event); });
    await new Promise((r) => setTimeout(r, 30));
    expect(tiles()).toHaveLength(0);
  });

  it("offers Take photo and Record video on a touch device, through a source sheet", async () => {
    const real = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q.includes("pointer: coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Add photos or videos" }));
    const sheet = await screen.findByRole("dialog", { name: "Add photos or videos" });
    expect(within(sheet).getByRole("button", { name: "Take photo" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Record video" })).toBeEnabled();
    expect(screen.getByTestId("camera-photo")).toHaveAttribute("capture", "environment");
    expect(screen.getByTestId("camera-video")).toHaveAttribute("capture", "environment");
    expect(screen.getByTestId("camera-video")).toHaveAttribute("accept", "video/*");
    window.matchMedia = real;
  });

  it("adds a recorded video from the camera input", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.upload(screen.getByTestId("camera-video"), mp4("recorded.mp4"));
    await waitFor(() => expect(kinds()).toEqual(["video"]));
  });
});

describe("validation messages", () => {
  it("explains an iPhone .mov video and suggests Most Compatible", async () => {
    render(<Host />);
    fireEvent.change(input(), { target: { files: [new File(["x"], "IMG_1.MOV", { type: "video/quicktime" })] } });
    const alert = await screen.findByText(/IMG_1\.MOV: This looks like an iPhone video/);
    expect(alert).toHaveTextContent("Most Compatible");
    expect(alert).toHaveTextContent("choose an MP4 or WebM file");
    expect(tiles()).toHaveLength(0);
  });

  it("explains an iPhone HEIC photo", async () => {
    render(<Host />);
    fireEvent.change(input(), { target: { files: [new File(["x"], "IMG_2.HEIC", { type: "image/heic" })] } });
    expect(await screen.findByText(/IMG_2\.HEIC: This is an iPhone HEIC photo/)).toBeInTheDocument();
  });

  it("refuses a video that is too long, too big, or cannot be played", async () => {
    clips.info = { "long.mp4": { durationSec: 75, width: 640, height: 360 }, "broken.mp4": { error: "video_unplayable" } };
    render(<Host />);
    fireEvent.change(input(), { target: { files: [mp4("long.mp4"), mp4("huge.mp4", 25 * 1024 * 1024 + 1), mp4("broken.mp4")] } });
    expect(await screen.findByText(/long\.mp4: Each video must be 60 seconds or shorter/)).toBeInTheDocument();
    expect(screen.getByText(/huge\.mp4: Each video must be 25 MB or smaller/)).toBeInTheDocument();
    expect(screen.getByText(/broken\.mp4: Your browser could not play this video.*HEVC/)).toBeInTheDocument();
    expect(tiles()).toHaveLength(0);
  });

  it("refuses a photo that is too small, too big or the wrong type, and keeps the good ones", async () => {
    render(<Host />);
    fireEvent.change(input(), { target: { files: [png("tiny.png", 50), png("ok.png"), new File(["x"], "x.gif", { type: "image/gif" }), new File(["x"], "doc.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText(/tiny\.png: Each image must be at least 200 pixels/)).toBeInTheDocument();
    expect(screen.getByText(/x\.gif: Use a JPG, PNG or WebP image/)).toBeInTheDocument();
    expect(screen.getByText(/doc\.pdf: Use a photo \(JPG, PNG or WebP\) or a video \(MP4 or WebM\)/)).toBeInTheDocument();
    expect(tiles()).toHaveLength(1);
  });
});

describe("plan limits", () => {
  it("counts photos and videos from the limits it is given, never from fixed numbers", async () => {
    const user = userEvent.setup();
    render(<Host limits={{ photos: 4, videos: 1 }} />);
    await add(user, png("a.png"), mp4("a.mp4"));
    expect(screen.getByTestId("media-summary")).toHaveTextContent("1 of 4 photos, 1 of 1 video");
  });

  it("stops a full kind, says why, and still allows the other kind", async () => {
    const user = userEvent.setup();
    render(<Host limits={{ photos: 2, videos: 1 }} />);
    await add(user, mp4("a.mp4"), png("a.png"));
    await add(user, mp4("b.mp4"), png("b.png"), png("c.png"));
    expect(kinds()).toEqual(["video", "image", "image"]);
    expect(screen.getByText(/1 video was not added. Your plan allows 1 video per item/)).toBeInTheDocument();
    expect(screen.getByText(/1 photo was not added. Your plan allows 2 photos per item/)).toBeInTheDocument();
  });

  it("disables Add with an explanation when both kinds are full", async () => {
    const user = userEvent.setup();
    render(<Host limits={{ photos: 1, videos: 1 }} />);
    const addButton = screen.getByRole("button", { name: "Add files" });
    await add(user, png("a.png"), mp4("a.mp4"));
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAccessibleDescription(/Your plan allows 1 photo per item.*Your plan allows 1 video per item/);
  });

  it("does not cap anything while the limits are still loading", async () => {
    const user = userEvent.setup();
    render(<Host limits={null} />);
    await add(user, png("a.png"), png("b.png"));
    expect(tiles()).toHaveLength(2);
    expect(screen.getByTestId("media-summary")).toHaveTextContent("2 photos, 0 videos");
  });
});

describe("reordering", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      const at = this.dataset?.tile ? tiles().indexOf(this) : -1;
      if (at < 0) return { left: 0, top: 0, right: 400, bottom: 90, width: 400, height: 90, x: 0, y: 0, toJSON() {} };
      return { left: at * 100, top: 0, right: at * 100 + 90, bottom: 90, width: 90, height: 90, x: at * 100, y: 0, toJSON() {} };
    });
  });

  const seed = async (user) => {
    render(<Host />);
    await add(user, png("a.png"), mp4("b.mp4"), png("c.png"));
  };

  it("moves a tile with the keyboard buttons, announces it, and keeps focus on the same control", async () => {
    const user = userEvent.setup();
    await seed(user);
    await user.click(screen.getByRole("button", { name: "Move Photo 3 earlier" }));
    expect(kinds()).toEqual(["image", "image", "video"]);
    expect(live()).toBe("Photo 3 moved to position 2.");
    await waitFor(() => expect(screen.getByRole("button", { name: /Move Photo 2 earlier/ })).toHaveFocus());
  });

  it("announces that the cover will be the next photo when a video lands first", async () => {
    const user = userEvent.setup();
    await seed(user);
    await user.click(screen.getByRole("button", { name: "Move Video 2 earlier" }));
    expect(kinds()).toEqual(["video", "image", "image"]);
    expect(live()).toBe("Video 2 moved to position 1. Cover will be the next photo.");
    expect(screen.getByText("Cover will be the next photo.")).toBeInTheDocument();
    expect(within(tiles()[1]).getByText("Cover")).toBeInTheDocument();
    expect(within(tiles()[0]).queryByText("Cover")).toBeNull();
  });

  it("disables Move earlier on the first tile and Move later on the last", async () => {
    const user = userEvent.setup();
    await seed(user);
    expect(screen.getByRole("button", { name: "Move Photo 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Photo 3 later" })).toBeDisabled();
  });

  it("moves focus to the other button when a tile reaches an end", async () => {
    const user = userEvent.setup();
    await seed(user);
    await user.click(screen.getByRole("button", { name: "Move Video 2 earlier" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Video 1 later" })).toHaveFocus());
  });

  it("drags a tile with the pointer, shows a drop indicator, and drops it in the new place", async () => {
    const user = userEvent.setup();
    await seed(user);
    const grip = tiles()[0].querySelector("[data-grip]");
    fireEvent.pointerDown(grip, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 45, clientY: 45 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 150, clientY: 45 });
    expect(await screen.findByTestId("drop-indicator")).toBeInTheDocument();
    expect(tiles()[0]).toHaveAttribute("data-dragging", "true");
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 250, clientY: 45 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 250, clientY: 45 });
    await waitFor(() => expect(labels()).toEqual(["Video 1", "Photo 2", "Photo 3"]));
    expect(kinds()).toEqual(["video", "image", "image"]);
    expect(live()).toBe("Photo 1 moved to position 3. Cover will be the next photo.");
    expect(screen.queryByTestId("drop-indicator")).toBeNull();
  });

  it("measures the drop target from the dragged tile's own slot, not from where its handle has carried it", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      const at = this.dataset?.tile ? tiles().indexOf(this) : -1;
      if (at < 0) return { left: 0, top: 0, right: 400, bottom: 90, width: 400, height: 90, x: 0, y: 0, toJSON() {} };
      const shift = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(this.style.transform ?? "");
      const dx = shift ? Number(shift[1]) : 0;
      const left = at * 100 + dx;
      return { left, top: 0, right: left + 90, bottom: 90, width: 90, height: 90, x: left, y: 0, toJSON() {} };
    });
    const user = userEvent.setup();
    await seed(user);
    const grip = tiles()[2].querySelector("[data-grip]");
    fireEvent.pointerDown(grip, { pointerId: 3, pointerType: "mouse", button: 0, clientX: 245, clientY: 80 });
    for (const x of [235, 210, 185, 160, 135, 110]) {
      fireEvent.pointerMove(window, { pointerId: 3, clientX: x, clientY: 80 });
      await waitFor(() => expect(tiles()[2].style.transform).toContain(`${x - 245}px`));
    }
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 110, clientY: 80 });
    await waitFor(() => expect(kinds()).toEqual(["image", "image", "video"]));
  });

  it("drags with touch input as well", async () => {
    const user = userEvent.setup();
    await seed(user);
    const grip = tiles()[2].querySelector("[data-grip]");
    fireEvent.pointerDown(grip, { pointerId: 7, pointerType: "touch", clientX: 245, clientY: 45 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 20, clientY: 45 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 20, clientY: 45 });
    await waitFor(() => expect(kinds()).toEqual(["image", "image", "video"]));
  });

  it("cancels a drag with Escape and a tiny movement is not a drag", async () => {
    const user = userEvent.setup();
    await seed(user);
    const grip = tiles()[0].querySelector("[data-grip]");
    fireEvent.pointerDown(grip, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 45, clientY: 45 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 250, clientY: 45 });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 250, clientY: 45 });
    expect(kinds()).toEqual(["image", "video", "image"]);
    fireEvent.pointerDown(grip, { pointerId: 2, pointerType: "mouse", button: 0, clientX: 45, clientY: 45 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 46, clientY: 45 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 46, clientY: 45 });
    expect(kinds()).toEqual(["image", "video", "image"]);
  });
});

describe("removing", () => {
  it("removes a queued file at once, moves focus to a neighbour and announces it", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await add(user, png("a.png"), png("b.png"));
    await user.click(screen.getByRole("button", { name: "Remove Photo 1" }));
    expect(tiles()).toHaveLength(1);
    expect(live()).toBe("Photo 1 removed. 1 item left.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Photo 1" })).toHaveFocus());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:m-1");
  });

  it("returns focus to Add when the last tile is removed", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await add(user, png("a.png"));
    await user.click(screen.getByRole("button", { name: "Remove Photo 1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add files" })).toHaveFocus());
  });

  it("asks before removing a saved photo and keeps it when told to Keep", async () => {
    const user = userEvent.setup();
    const item = M.state.items.find((i) => i.imagePaths.length > 0);
    render(<Host itemId={item.id} />);
    await screen.findAllByRole("listitem");
    await waitFor(() => expect(tiles().length).toBe(item.imagePaths.length));
    await user.click(screen.getByRole("button", { name: "Remove Photo 1" }));
    const group = screen.getByRole("group", { name: "Remove Photo 1" });
    expect(within(group).getByRole("button", { name: "Keep" })).toHaveFocus();
    await user.click(within(group).getByRole("button", { name: "Keep" }));
    expect(item.imagePaths.length).toBeGreaterThan(0);
    expect(tiles().length).toBe(item.imagePaths.length);
    await user.click(screen.getByRole("button", { name: "Remove Photo 1" }));
    await user.click(within(screen.getByRole("group", { name: "Remove Photo 1" })).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(tiles().length).toBe(Math.max(0, item.imagePaths.length)));
    expect(item.imageCount).toBe(item.imagePaths.length);
  });
});

describe("uploads on an existing item", () => {
  const empty = () => M.state.items.find((i) => i.imagePaths.length === 0) ?? M.state.items[0];

  it("uploads right away with per-tile progress, and the tile becomes saved", async () => {
    const user = userEvent.setup();
    const item = empty();
    const before = item.imagePaths.length;
    render(<Host itemId={item.id} limits={{ photos: 20, videos: 2 }} />);
    await waitFor(() => expect(tiles().length).toBe(before));
    await add(user, png("new.png"));
    const tile = () => tiles().at(-1);
    await waitFor(() => expect(within(tile()).getByRole("progressbar")).toBeInTheDocument());
    await waitFor(() => expect(tile()).toHaveAttribute("data-status", "saved"), { timeout: 3000 });
    expect(item.imagePaths).toHaveLength(before + 1);
  });

  it("runs at most three uploads at a time", async () => {
    const user = userEvent.setup();
    const item = empty();
    let running = 0;
    let peak = 0;
    const gate = [];
    vi.spyOn(api, "uploadItemPhoto").mockImplementation((...a) => {
      running += 1;
      peak = Math.max(peak, running);
      return new Promise((resolve) => gate.push(() => { running -= 1; resolve({ path: `p/${gate.length}.webp`, kind: "image" }); }));
    });
    render(<Host itemId={item.id} limits={{ photos: 50, videos: 2 }} />);
    await waitFor(() => expect(manager.loading).toBe(false));
    await add(user, ...[1, 2, 3, 4, 5].map((k) => png(`f${k}.png`)));
    await waitFor(() => expect(gate.length).toBe(3));
    expect(peak).toBe(3);
    act(() => gate.shift()());
    await waitFor(() => expect(gate.length).toBe(3));
    expect(peak).toBe(3);
    for (let k = 0; k < 4; k += 1) {
      await waitFor(() => expect(gate.length).toBeGreaterThan(0));
      act(() => gate.shift()());
    }
    await waitFor(() => expect(manager.inFlight).toBe(0));
    expect(peak).toBe(3);
  });

  it("cancels an upload, keeps the tile with a message, and retries it", async () => {
    const user = userEvent.setup();
    const item = empty();
    render(<Host itemId={item.id} limits={{ photos: 20, videos: 2 }} />);
    await waitFor(() => expect(manager.loading).toBe(false));
    await add(user, png("a.png"));
    await user.click(await screen.findByRole("button", { name: /Cancel upload of Photo/ }));
    const tile = () => tiles().at(-1);
    await waitFor(() => expect(tile()).toHaveAttribute("data-status", "error"));
    expect(within(tile()).getByText("Upload cancelled.")).toBeInTheDocument();
    await user.click(within(tile()).getByRole("button", { name: /^Retry/ }));
    await waitFor(() => expect(tile()).toHaveAttribute("data-status", "saved"), { timeout: 3000 });
  });

  it("keeps the grid when an upload fails, shows the reason, and a retry can succeed", async () => {
    const user = userEvent.setup();
    const item = empty();
    const spy = vi.spyOn(api, "uploadItemPhoto").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "file_not_uploaded" }));
    render(<Host itemId={item.id} limits={{ photos: 20, videos: 2 }} />);
    await waitFor(() => expect(manager.loading).toBe(false));
    const before = tiles().length;
    await add(user, png("a.png"), png("b.png"));
    await waitFor(() => expect(screen.getByText("The upload did not finish. Try again.")).toBeInTheDocument());
    expect(tiles().length).toBe(before + 2);
    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: /^Retry/ }));
    await waitFor(() => expect(tiles().filter((t) => t.dataset.status === "saved").length).toBe(before + 2), { timeout: 3000 });
  });
});

describe("queue and upload on save for a new item", () => {
  it("uploads nothing until commit, then uploads every file and persists the mixed order", async () => {
    const user = userEvent.setup();
    render(<Host limits={{ photos: 10, videos: 3 }} />);
    await add(user, png("a.png"), mp4("b.mp4"), png("c.png"));
    await user.click(screen.getByRole("button", { name: "Move Video 2 earlier" }));
    expect(kinds()).toEqual(["video", "image", "image"]);
    const item = M.state.items.find((i) => i.imagePaths.length === 0) ?? M.state.items[0];
    const photos = vi.spyOn(api, "uploadItemPhoto");
    expect(photos).not.toHaveBeenCalled();
    let result;
    await act(async () => { result = await manager.commit(item.id); });
    expect(result).toEqual({ failed: 0, orderError: "" });
    expect(photos).toHaveBeenCalledTimes(2);
    const saved = await api.listItemMedia(item.id);
    expect(saved.map((m) => m.kind).slice(-3)).toEqual(["video", "image", "image"]);
    expect(tiles().every((t) => t.dataset.status === "saved")).toBe(true);
  });

  it("reports failed files from commit and keeps them in the grid for retry", async () => {
    const user = userEvent.setup();
    render(<Host limits={{ photos: 10, videos: 3 }} />);
    await add(user, png("a.png"), png("b.png"));
    const item = M.state.items[0];
    vi.spyOn(api, "uploadItemPhoto").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "file_not_uploaded" }));
    let result;
    await act(async () => { result = await manager.commit(item.id); });
    expect(result.failed).toBe(1);
    expect(tiles()).toHaveLength(2);
    expect(tiles().filter((t) => t.dataset.status === "error")).toHaveLength(1);
  });

  it("revokes object URLs and aborts uploads when it unmounts", async () => {
    const user = userEvent.setup();
    const item = M.state.items[0];
    let aborted = false;
    vi.spyOn(api, "uploadItemPhoto").mockImplementation((id, file, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(Object.assign(new Error("c"), { code: "upload_cancelled" })); })));
    const view = render(<Host itemId={item.id} limits={{ photos: 50, videos: 2 }} />);
    await waitFor(() => expect(manager.loading).toBe(false));
    await add(user, png("a.png"));
    await waitFor(() => expect(manager.inFlight).toBe(1));
    view.unmount();
    expect(aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe("loading an existing item", () => {
  it("shows an item's old photos and videos in the order the server returns them", async () => {
    const item = M.state.items.find((i) => i.imagePaths.length > 0);
    await api.uploadItemVideo(item.id, mp4("old.mp4"), { durationSec: 9 });
    render(<Host itemId={item.id} />);
    await waitFor(() => expect(tiles().length).toBe(item.imagePaths.length + 1));
    expect(kinds().at(-1)).toBe("video");
    expect(within(tiles().at(-1)).getByText("Video 0:09")).toBeInTheDocument();
  });

  it("falls back to the photos it already knows when the list cannot be loaded", async () => {
    vi.spyOn(api, "listItemMedia").mockRejectedValue(new Error("down"));
    const item = M.state.items.find((i) => i.imagePaths.length > 0);
    function Fallback() {
      manager = useMediaManager({ itemId: item.id, limits: null, fallbackPaths: item.imagePaths });
      return <MediaManager manager={manager} hasItem />;
    }
    render(<Fallback />);
    expect(await screen.findByText(/could not load this item's videos/)).toBeInTheDocument();
    expect(tiles().length).toBe(item.imagePaths.length);
  });
});
