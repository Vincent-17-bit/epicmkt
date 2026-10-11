import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setLatency } from "@epicmkt/backend";
import { blankItem, PUBLISH_BLOCKED_MESSAGE } from "@epicmkt/shared";
import { jpeg, webp, mp4 } from "../../../shared/src/seller/media-fixtures.js";
import * as mock from "../api/mock.js";
import { Toaster } from "../ui/ui.jsx";
import { useToasts } from "../ui/toasts.js";
import { CatalogPage } from "../catalog/CatalogPage.jsx";
import { setMediaEngine } from "./engine.js";
import { bytesOf } from "./bytes.js";
import { inspectMedia } from "@epicmkt/shared";
import { resetMediaStore, timing } from "./mediaStore.js";

setLatency(0);

const engine = {
  canPlayType: () => "maybe",
  async decodeImage(f) { const i = inspectMedia(await bytesOf(f)); if (!i.ok) throw new Error("x"); return { width: i.width, height: i.height }; },
  async encode(d, { width }) { const height = Math.round((d.height * width) / d.width); return { blob: new Blob([webp(width, height)]), width, height, type: "image/webp", ext: "webp" }; },
  async placeholder() { return "data:image/webp;base64,UklGRgAAAAA="; },
  async probeVideo(f) { const i = inspectMedia(await bytesOf(f)); return { duration: i.durationSec, width: i.width, height: i.height }; },
  async captureFrame(_p, t) { return { blob: new Blob([webp(640, 360)]), type: "image/webp", ext: "webp", width: 640, height: 360, timeSec: t }; },
};
const photo = (n = "a.jpg") => new File([jpeg(2000, 1500)], n, { type: "image/jpeg" });

const mount = async () => {
  const router = createMemoryRouter([{ path: "/business/catalog", element: <><CatalogPage /><Toaster /></> }, { path: "/business/plan", element: <div>Plan</div> }], { initialEntries: ["/business/catalog"] });
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(screen.queryByText(/Loading your catalog/)).not.toBeInTheDocument());
  return { user };
};

beforeEach(async () => {
  mock.resetMock();
  resetMediaStore();
  setMediaEngine(engine);
  timing.undoMs = 40;
  useToasts.getState().clear();
  let n = 0;
  URL.createObjectURL = () => `blob:t/${n++}`;
  URL.revokeObjectURL = () => {};
  HTMLMediaElement.prototype.pause = () => {};
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  await mock.login("ES100001", "Demo-Passw0rd");
});
afterEach(() => setMediaEngine(null));

describe("media inside the catalog", () => {
  test("duplicating an item copies its media into new files and rows, sharing nothing", async () => {
    const user = userEvent.setup();
    const item = await mock.createItem(blankItem({ name: "Braids", price: 500, sort: 0, shortDescription: "ok" }));
    await mock.uploadMedia(item.id, photo("1.jpg"));
    await mock.uploadMedia(item.id, photo("2.jpg"));
    await mock.uploadMedia(item.id, new File([mp4(1280, 720, 20)], "v.mp4", { type: "video/mp4" }));
    await mount();
    await user.click(screen.getByRole("button", { name: "Duplicate Braids" }));
    await waitFor(() => expect(new Set(mock.mockMediaRows().map((r) => r.item_id)).size).toBe(2), { timeout: 4000 });
    const all = mock.mockMediaRows();
    const original = all.filter((r) => r.item_id === item.id);
    const copy = all.filter((r) => r.item_id !== item.id);
    expect(copy).toHaveLength(3);
    expect(copy.map((r) => r.kind).sort()).toEqual(original.map((r) => r.kind).sort());
    const ids = new Set(original.map((r) => r.id));
    const paths = new Set(original.flatMap((r) => [r.path, r.poster_path, ...Object.values(r.variants)]).filter(Boolean));
    for (const r of copy) {
      expect(ids.has(r.id)).toBe(false);
      for (const p of [r.path, r.poster_path, ...Object.values(r.variants)].filter(Boolean)) {
        expect(paths.has(p)).toBe(false);
        expect(p).toContain(r.item_id);
      }
    }
  });

  test("deleting an item deletes its media rows and files", async () => {
    const user = userEvent.setup();
    const [a, b] = [await mock.createItem(blankItem({ name: "Gone", price: 1, sort: 0, shortDescription: "ok" })), await mock.createItem(blankItem({ name: "Stays", price: 1, sort: 1, shortDescription: "ok" }))];
    await mock.uploadMedia(a.id, photo());
    await mock.uploadMedia(b.id, photo());
    await mount();
    await user.click(screen.getByRole("button", { name: "Delete Gone" }));
    await waitFor(() => expect(mock.mockMediaRows().map((r) => r.item_id)).toEqual([b.id]), { timeout: 4000 });
    for (const path of mock.mockMediaFiles().keys()) expect(path).toContain(b.id);
  });

  test("an item cannot be turned on without a ready photo, and a video alone is not enough", async () => {
    const user = userEvent.setup();
    const item = await mock.createItem(blankItem({ name: "Hidden one", price: 100, sort: 0, shortDescription: "ok", visible: false }));
    await mount();
    await user.click(screen.getByRole("switch", { name: /Visible to shoppers: Hidden one/ }));
    expect(await screen.findByText(PUBLISH_BLOCKED_MESSAGE)).toBeInTheDocument();
    expect((await mock.listItems()).find((i) => i.id === item.id).visible).toBe(false);

    await mock.uploadMedia(item.id, new File([mp4(1280, 720, 20)], "v.mp4", { type: "video/mp4" }));
    await user.click(screen.getByRole("switch", { name: /Visible to shoppers: Hidden one/ }));
    await waitFor(() => expect(screen.getAllByText(PUBLISH_BLOCKED_MESSAGE).length).toBeGreaterThan(0));
    expect((await mock.listItems()).find((i) => i.id === item.id).visible).toBe(false);
  });

  test("the database refuses it too (photo_required) even if the screen did not", async () => {
    const item = await mock.createItem(blankItem({ name: "Direct", price: 100, sort: 0, shortDescription: "ok", visible: false }));
    await expect(mock.updateItem(item.id, { ...item, visible: true })).rejects.toMatchObject({ code: "photo_required" });
    await mock.uploadMedia(item.id, photo());
    await expect(mock.updateItem(item.id, { ...item, visible: true })).resolves.toBeTruthy();
  });

  test("a photo dropped on a table row goes to that row's item only", async () => {
    const [a, b] = [await mock.createItem(blankItem({ name: "Row A", price: 1, sort: 0, shortDescription: "ok" })), await mock.createItem(blankItem({ name: "Row B", price: 1, sort: 1, shortDescription: "ok" }))];
    await mount();
    const rowB = document.querySelector(`[data-row="${b.id}"]`);
    fireEvent.dragEnter(rowB, { dataTransfer: { types: ["Files"], files: [] } });
    expect(rowB).toHaveAttribute("data-drop-over", "true");
    expect(document.querySelector(`[data-row="${a.id}"]`)).not.toHaveAttribute("data-drop-over");
    fireEvent.drop(rowB, { dataTransfer: { types: ["Files"], files: [photo("drop.jpg")] } });
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(1), { timeout: 4000 });
    expect(mock.mockMediaRows()[0].item_id).toBe(b.id);
    await waitFor(() => expect(within(rowB).getByTestId("row-cover")).toBeInTheDocument());
  });

  test("the first-item form takes photos and uploads them once the item is saved", async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByRole("region", { name: "Photos and videos" })).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("media-browse"), { target: { files: [photo("first.jpg")] } });
    expect(screen.getByText(/uploaded as soon as this item is saved/i)).toBeInTheDocument();
    expect(mock.mockMediaRows()).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "First item");
    await user.type(screen.getByRole("textbox", { name: /Price \(KSh\)/ }), "900");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(mock.mockMediaRows()).toHaveLength(1), { timeout: 5000 });
    const [item] = await mock.listItems();
    expect(mock.mockMediaRows()[0].item_id).toBe(item.id);
  });
});
