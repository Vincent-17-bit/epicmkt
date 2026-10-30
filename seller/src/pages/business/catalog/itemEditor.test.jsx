import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../../api/index.js";
import { M, signedInApp } from "../../../test/utils.jsx";

vi.mock("../../../lib/videoPoster.js", () => ({
  readVideo: vi.fn(async () => ({ durationSec: 12, width: 640, height: 360, poster: new Blob(["p"], { type: "image/jpeg" }) })),
  posterFromUrl: vi.fn(async () => null),
}));

const png = (name, side = 300) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, side);
  new DataView(b.buffer).setUint32(20, side);
  return new File([b], name, { type: "image/png" });
};
const mp4 = (name) => new File([new Uint8Array(20)], name, { type: "video/mp4" });
const tiles = () => [...document.querySelectorAll("[data-tile]")];
const kinds = () => tiles().map((t) => t.dataset.kind);
const premium = () => { M.state.business.planKey = "premium"; };

beforeEach(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:e-${++n}`);
  URL.revokeObjectURL = vi.fn();
});

const fill = async (user, region, name = "Gallery item") => {
  await user.type(within(region).getByLabelText("Name"), name);
  await user.type(within(region).getByLabelText("Price (KES)"), "900");
};

describe("item editor page", () => {
  it("opens as a full page with a live preview and the media manager", async () => {
    await signedInApp("/business/catalog/new");
    const region = await screen.findByRole("region", { name: "Add item" });
    expect(within(region).getByRole("heading", { level: 1, name: "Add item" })).toBeInTheDocument();
    expect(within(region).getByRole("complementary", { name: "Live preview" })).toBeInTheDocument();
    await waitFor(() => expect(within(region).getByTestId("media-summary")).toHaveTextContent("0 of 7 photos, 0 of 1 video"));
  });

  it("shows the plan limits from the API, not fixed numbers", async () => {
    await signedInApp("/business/catalog/new", premium);
    const region = await screen.findByRole("region", { name: "Add item" });
    await waitFor(() => expect(within(region).getByTestId("media-summary")).toHaveTextContent("0 of 15 photos, 0 of 3 videos"));
  });

  it("updates the preview as the seller types, with the short description under the name and the description below", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/new");
    const region = await screen.findByRole("region", { name: "Add item" });
    await user.type(within(region).getByLabelText("Name"), "Oak table");
    await user.type(within(region).getByLabelText("Short description (optional)"), "Solid oak, seats six");
    await user.type(within(region).getByLabelText("Description"), "Handmade in Nairobi.");
    const preview = within(region).getByTestId("item-preview");
    expect(within(preview).getByRole("heading", { name: "Oak table" })).toBeInTheDocument();
    const short = within(preview).getByTestId("preview-short");
    const full = within(preview).getByTestId("preview-description");
    expect(short).toHaveTextContent("Solid oak, seats six");
    expect(full).toHaveTextContent("Handmade in Nairobi.");
    expect(short.compareDocumentPosition(full) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("queues files for a new item and uploads them in the chosen mixed order on save", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/new", premium);
    const region = await screen.findByRole("region", { name: "Add item" });
    await fill(user, region);
    await user.upload(within(region).getByTestId("media-input"), [png("1.png"), png("2.png"), mp4("a.mp4"), png("3.png"), mp4("b.mp4")]);
    await waitFor(() => expect(tiles()).toHaveLength(5));
    expect(within(region).getAllByText("Uploads on save")).toHaveLength(5);
    await user.click(within(region).getByRole("button", { name: "Move Video 3 earlier" }));
    await user.click(within(region).getByRole("button", { name: "Move Video 5 earlier" }));
    expect(kinds()).toEqual(["image", "video", "image", "video", "image"]);
    const preview = within(region).getByTestId("item-preview");
    expect(within(preview).getAllByRole("button", { name: /^(Photo|Video) \d$/ })).toHaveLength(5);
    expect(M.state.items.some((i) => i.name === "Gallery item")).toBe(false);
    await user.click(within(region).getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(M.state.items.some((i) => i.name === "Gallery item")).toBe(true));
    const made = M.state.items.find((i) => i.name === "Gallery item");
    await waitFor(async () => expect((await api.listItemMedia(made.id)).map((m) => m.kind)).toEqual(["image", "video", "image", "video", "image"]), { timeout: 5000 });
    expect(await screen.findByTestId("listing-grid")).toBeInTheDocument();
    expect(await screen.findByText("Item added as a draft.")).toBeInTheDocument();
  });

  it("keeps everything on the page when an upload fails during save, and a retry finishes it", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/new");
    const region = await screen.findByRole("region", { name: "Add item" });
    await fill(user, region, "Retry item");
    await user.upload(within(region).getByTestId("media-input"), [png("a.png"), png("b.png")]);
    await waitFor(() => expect(tiles()).toHaveLength(2));
    vi.spyOn(api, "uploadItemPhoto").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "file_not_uploaded" }));
    await user.click(within(region).getByRole("button", { name: "Add item" }));
    expect(await within(region).findByText(/Item added as a draft. 1 file did not upload/)).toBeInTheDocument();
    expect(screen.queryByTestId("listing-grid")).toBeNull();
    expect(tiles()).toHaveLength(2);
    expect(within(region).getByRole("heading", { level: 1, name: "Edit item" })).toBeInTheDocument();
    api.uploadItemPhoto.mockRestore();
    await user.click(within(region).getByRole("button", { name: /^Retry/ }));
    await waitFor(() => expect(tiles().every((t) => t.dataset.status === "saved")).toBe(true), { timeout: 4000 });
    await user.click(within(region).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByTestId("listing-grid")).toBeInTheDocument();
    expect(M.state.items.filter((i) => i.name === "Retry item")).toHaveLength(1);
  });

  it("waits for uploads that are still running when Save is pressed, and says so", async () => {
    const user = userEvent.setup();
    const item = M.state.items;
    await signedInApp("/business/catalog");
    await screen.findByTestId("listing-grid");
    const target = M.state.items.find((i) => i.visible && !i.removedByAdmin);
    await user.click(within(screen.getAllByTestId("listing").find((li) => li.dataset.id === target.id)).getByRole("button", { name: /^Edit/ }));
    const region = await screen.findByRole("region", { name: "Edit item" });
    await waitFor(() => expect(within(region).queryByText("Loading photos and videos...")).toBeNull());
    const before = target.imagePaths.length;
    await user.upload(within(region).getByTestId("media-input"), png("late.png"));
    await waitFor(() => expect(within(region).getByRole("progressbar")).toBeInTheDocument());
    expect(within(region).getByText(/1 upload is still running. Save waits for it\./)).toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByTestId("listing-grid")).toBeInTheDocument();
    expect(target.imagePaths).toHaveLength(before + 1);
    void item;
  });

  it("asks before leaving with unsaved media", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/new");
    const region = await screen.findByRole("region", { name: "Add item" });
    await user.upload(within(region).getByTestId("media-input"), png("a.png"));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await user.click(within(region).getByRole("button", { name: "Cancel" }));
    expect(within(region).getByText(/You have changes that are not saved/)).toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByTestId("listing-grid")).toBeInTheDocument();
  });
});

describe("existing items still open and edit", () => {
  it("opens an item with old photos and a video, shows them in order, and saves a text change without touching them", async () => {
    const user = userEvent.setup();
    let target;
    await signedInApp("/business/catalog", async () => {
      target = M.state.items.find((i) => i.visible && !i.removedByAdmin);
      target.imagePaths = ["demo/old-1.webp", "demo/old-2.webp"];
      target.imageCount = 2;
      await api.uploadItemVideo(target.id, mp4("old.mp4"), { durationSec: 20 });
    });
    await screen.findByTestId("listing-grid");
    await user.click(within(screen.getAllByTestId("listing").find((li) => li.dataset.id === target.id)).getByRole("button", { name: /^Edit/ }));
    const region = await screen.findByRole("region", { name: "Edit item" });
    await waitFor(() => expect(tiles()).toHaveLength(3), { timeout: 3000 });
    expect(kinds()).toEqual(["image", "image", "video"]);
    expect(within(region).getByText("Cover")).toBeInTheDocument();
    await waitFor(() => expect(within(region).getByTestId("media-summary")).toHaveTextContent("2 of 7 photos, 1 of 1 video"));
    await user.clear(within(region).getByLabelText("Name"));
    await user.type(within(region).getByLabelText("Name"), "Renamed");
    await user.click(within(region).getByRole("button", { name: "Save changes" }));
    await screen.findByTestId("listing-grid");
    expect(target.name).toBe("Renamed");
    expect(target.imagePaths).toEqual(["demo/old-1.webp", "demo/old-2.webp"]);
    expect((await api.listItemMedia(target.id)).map((m) => m.kind)).toEqual(["image", "image", "video"]);
  });

  it("says when an item cannot be found", async () => {
    await signedInApp("/business/catalog/nope/edit");
    expect(await screen.findByRole("heading", { name: "Item not found" })).toBeInTheDocument();
  });
});
