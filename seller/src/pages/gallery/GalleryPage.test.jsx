import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render.jsx";
import GalleryPage from "./GalleryPage.jsx";

vi.mock("../../lib/imagePipeline.js", () => ({
  IMAGE_ACCEPT: "image/*",
  imageErrorMessage: (e) => (e?.code === "too_small" ? "Photos need at least 200 pixels on each side." : null),
  processImage: vi.fn(async (file) => {
    if (file.name === "tiny.png") throw Object.assign(new Error("too_small"), { code: "too_small" });
    return { blob: new Blob(["x"], { type: "image/webp" }), width: 800, height: 600, previewUrl: "blob:x" };
  }),
}));

const photo = (n, extra = {}) => ({
  id: `g${n}`, business_id: "b-demo", path: `b-demo/gallery/g${n}.webp`, url: `blob:${n}`, width: 800, height: 600, caption: `Caption ${n}`, sort: n,
  pair_id: null, pair_role: null, deleted_at: null, admin_status: null, admin_reason: null, removed_by_admin: false, hidden_by_admin: false, ...extra,
});

const seed = (count, extra) => (s) => { s.gallery = Array.from({ length: count }, (_, n) => photo(n, extra?.(n))); };
const file = (name = "a.png") => new File(["x"], name, { type: "image/png" });

describe("gallery", () => {
  it("shows the empty state and the standard limit", async () => {
    renderPage(<GalleryPage />);
    expect(await screen.findByText("No gallery photos yet")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Gallery photos" })).toHaveAttribute("aria-valuemax", "5");
  });

  it("premium allows 20 and standard at 5 shows the upgrade prompt and disables adding", async () => {
    renderPage(<GalleryPage />, {}, seed(5));
    expect(await screen.findByText(/used all 5 gallery photos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add photos" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "See Premium" })).toBeInTheDocument();
    renderPage(<GalleryPage />, { plan_key: "premium" }, seed(5));
    await waitFor(() => expect(screen.getAllByRole("meter", { name: "Gallery photos" }).at(-1)).toHaveAttribute("aria-valuemax", "20"));
  });

  it("uploads photos, stops at the limit and reports bad images", async () => {
    const user = userEvent.setup();
    renderPage(<GalleryPage />, {}, seed(4));
    const input = await screen.findByLabelText("Choose photos");
    await user.upload(input, [file("a.png"), file("b.png")]);
    expect(await screen.findByText(/allows 5 gallery photos/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add photos" })).toBeDisabled());
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("explains an image that is too small", async () => {
    const user = userEvent.setup();
    renderPage(<GalleryPage />);
    await user.upload(await screen.findByLabelText("Choose photos"), file("tiny.png"));
    expect(await screen.findByText("Photos need at least 200 pixels on each side.")).toBeInTheDocument();
  });

  it("deletes with Undo and removes for good when the undo window passes", async () => {
    const user = userEvent.setup();
    renderPage(<GalleryPage />, {}, seed(2));
    const tiles = await screen.findAllByRole("listitem");
    await user.click(within(tiles[0]).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Photo deleted")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    await waitFor(() => expect(screen.getByText("2 of 5")).toBeInTheDocument());
  });

  it("reorders with the up and down buttons", async () => {
    const user = userEvent.setup();
    renderPage(<GalleryPage />, {}, seed(3));
    const order = () => screen.getAllByLabelText("Caption").map((i) => i.value);
    await screen.findAllByRole("listitem");
    expect(order()).toEqual(["Caption 0", "Caption 1", "Caption 2"]);
    expect(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "Move earlier" })).toBeDisabled();
    await user.click(within(screen.getAllByRole("listitem")[2]).getByRole("button", { name: "Move earlier" }));
    await waitFor(() => expect(order()).toEqual(["Caption 0", "Caption 2", "Caption 1"]));
    await user.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "Move later" }));
    await waitFor(() => expect(order()).toEqual(["Caption 2", "Caption 0", "Caption 1"]));
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  });

  it("reorders by drag and drop", async () => {
    renderPage(<GalleryPage />, {}, seed(3));
    const tiles = await screen.findAllByRole("listitem");
    const dt = { setData() {}, getData: () => "", effectAllowed: "move", dropEffect: "move" };
    fireEvent.dragStart(tiles[0], { dataTransfer: dt });
    fireEvent.dragOver(tiles[2], { dataTransfer: dt });
    fireEvent.drop(tiles[2], { dataTransfer: dt });
    await waitFor(() => expect(screen.getAllByLabelText("Caption").map((i) => i.value)).toEqual(["Caption 1", "Caption 2", "Caption 0"]));
  });

  it("saves a caption on blur", async () => {
    const user = userEvent.setup();
    renderPage(<GalleryPage />, {}, seed(1));
    const caption = await screen.findByLabelText("Caption");
    await user.clear(caption);
    await user.type(caption, "Bridal updo");
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText("Caption")).toHaveValue("Bridal updo"));
    expect(caption).toHaveAttribute("maxlength", "120");
  });

  it("shows Removed by admin with the reason", async () => {
    renderPage(<GalleryPage />, {}, seed(2, (n) => (n === 0 ? { removed_by_admin: true, admin_status: "removed", admin_reason: "Not your photo" } : {})));
    expect(await screen.findByText("Removed by admin")).toBeInTheDocument();
    expect(screen.getByText(/Not your photo/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 of 5")).toBeInTheDocument());
  });

  it("is read-only when unlisted or suspended", async () => {
    for (const status of ["paused", "suspended"]) {
      const { unmount } = renderPage(<GalleryPage />, { status }, seed(2));
      await screen.findAllByRole("listitem");
      expect(screen.queryByRole("button", { name: "Add photos" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Move later" })).toBeNull();
      screen.getAllByLabelText("Caption").forEach((c) => expect(c).toBeDisabled());
      unmount();
    }
  });

  it("offers before and after only to barbershops and salons, and groups a pair in one tile", async () => {
    const user = userEvent.setup();
    renderPage(<GalleryPage />, { category_id: "gym-fitness" });
    await screen.findByText("No gallery photos yet");
    expect(screen.queryByRole("button", { name: "Add before and after" })).toBeNull();
    renderPage(<GalleryPage />, { category_id: "barbershop" });
    const open = await screen.findAllByRole("button", { name: "Add before and after" });
    await user.click(open.at(-1));
    const dialog = await screen.findByRole("dialog");
    await user.upload(within(dialog).getByLabelText("Before photo"), file("before.png"));
    await user.upload(within(dialog).getByLabelText("After photo"), file("after.png"));
    await user.click(within(dialog).getByRole("button", { name: "Add pair" }));
    await waitFor(() => expect(screen.getAllByText("Before").length).toBeGreaterThan(0));
    expect(screen.getAllByText("After").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText("2 of 5").length).toBeGreaterThan(0));
  });
});
