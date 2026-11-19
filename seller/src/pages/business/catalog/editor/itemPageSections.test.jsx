import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyItemForm } from "@epicmkt/shared";
import * as mock from "../../../../api/mock.js";
import { signedInApp } from "../../../../test/utils.jsx";
import { emptyPage, pageErrors, pagePayload, rawDetails, rawJoin, rawName } from "./page.js";
import { previewPayload } from "./previewPayload.js";

// Page sections (migration 0138): delivery for this item, notes buyers must see, the 5-picture gallery, From the brand pictures and
// "What's included" names. Their pictures are "extra" uploads that never take a photo slot.
afterEach(() => vi.restoreAllMocks());
// jsdom has no object urls; the editor shows a picture chosen on this device through one.
beforeEach(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test/${++n}`);
  URL.revokeObjectURL = vi.fn();
});
const png = (name) => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13])], name, { type: "image/png" });

describe("the page sections in the form", () => {
  it("send delivery, notes, pictures and the What's included photos in one payload; waiting pictures get the ids they uploaded with", () => {
    const form = {
      ...emptyItemForm(),
      includes: ["Remote control: batteries not included", "", "ARC cable"],
      includeMedia: [{ pending: "p1" }, null, { mediaId: "0b8c3d3e-6c7a-4b5e-9a1c-2f3d4e5f6a7b" }],
      page: {
        delivery: { mode: "custom", fee: "0", area: " Kisumu ", time: "Same day", notes: "", pickup: true },
        notices: [{ tone: "caution", title: "Product voltage: 240 V", text: "Use a converter on 110 V." }, { tone: "info", title: "", text: "" }],
        gallery: [{ pending: "g1", label: "Film mode", caption: "" }, { pending: "lost", label: "", caption: "" }],
        brand: { banner: { pending: "b1" }, cards: [{ pending: "c1", caption: " Reddot winner 2026 " }] }
      }
    };
    const ids = { extra: { p1: "11111111-1111-4111-8111-111111111111", g1: "22222222-2222-4222-8222-222222222222", b1: "33333333-3333-4333-8333-333333333333", c1: "44444444-4444-4444-8444-444444444444" } };
    expect(pagePayload(form, ids, { includes: true })).toEqual({
      delivery: { mode: "custom", fee: 0, area: "Kisumu", time: "Same day", notes: null, pickup: true },
      notices: [{ tone: "caution", title: "Product voltage: 240 V", text: "Use a converter on 110 V." }],
      gallery: [{ id: ids.extra.g1, label: "Film mode", caption: null }],
      brand: { banner: ids.extra.b1, cards: [{ id: ids.extra.c1, caption: "Reddot winner 2026" }] },
      includeMedia: [ids.extra.p1, "0b8c3d3e-6c7a-4b5e-9a1c-2f3d4e5f6a7b"]
    });
    expect(pagePayload({ ...emptyItemForm(), page: emptyPage() })).toEqual({ delivery: null, notices: [], gallery: [], brand: null });
  });

  it("a picture needs a name, details need a name, and a half-filled note or a bad fee are caught before saving", () => {
    const form = {
      ...emptyItemForm(),
      includes: ["", ": 2 pieces", "Power supply", "  "],
      includeMedia: [{ pending: "x" }, null, null, null],
      page: { ...emptyPage(), delivery: { mode: "custom", fee: "-3" }, notices: [{ tone: "info", title: "Voltage", text: "" }] }
    };
    const e = pageErrors(form);
    expect(e.includes).toEqual({ 0: "Give this picture a name, like \"Remote control\".", 1: "Add a name before the details." });
    expect(e.delivery.fee).toMatch(/shillings/);
    expect(e.notices).toEqual({ 0: { text: "Fill this in" } });
  });

  it("keeps a typed line exactly as typed, so the cursor never jumps; a colon in the name cannot split it", () => {
    expect(rawJoin("Remote ", "")).toBe("Remote ");
    expect(rawJoin("Remote control", " batteries")).toBe("Remote control:  batteries");
    expect([rawName("Remote control:  batteries"), rawDetails("Remote control:  batteries")]).toEqual(["Remote control", " batteries"]);
    expect(rawJoin("Cable: HDMI", "")).toBe("Cable - HDMI");
  });

  it("the live preview shows the sections, with pictures not uploaded yet as the seller's own files", () => {
    const file = png("g.png");
    const extras = { saved: new Map(), pic: (ref) => (ref?.pending === "g1" ? { file, width: 1600, height: 900 } : null) };
    const form = { ...emptyItemForm(), name: "Soundbar", page: { ...emptyPage(), gallery: [{ pending: "g1", label: "Film mode", caption: "" }], notices: [{ tone: "warning", title: "Hot surface", text: "Do not touch the vents." }] } };
    const p = previewPayload({ form, extras });
    expect(p.row.gallery).toEqual([{ blob: file, width: 1600, height: 900, label: "Film mode", caption: null }]);
    expect(p.row.notices).toEqual([{ tone: "warning", title: "Hot surface", text: "Do not touch the vents." }]);
    expect(p.row.delivery).toBeNull();
    expect(p.row.brand_page).toBeNull();
  });
});

describe("the editor", () => {
  it("saves delivery for one item, a note and gallery pictures that do not use a photo slot", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, "saveItemPage");
    const upload = vi.spyOn(mock, "uploadItemExtra");
    await signedInApp("/business/catalog/it-fade/edit");
    await screen.findByLabelText("Name");
    // Images (Media step)
    const gallery = document.querySelector('[data-area="gallery"]');
    fireEvent.change(gallery.querySelector('input[type="file"]'), { target: { files: [png("a.png"), png("b.png")] } });
    expect(await within(gallery).findByLabelText("Image 2: tab label (optional)")).toBeInTheDocument();
    await user.type(within(gallery).getByLabelText("Image 1: tab label (optional)"), "Before and after");
    // Delivery for this item (Price step)
    await user.click(screen.getByText("Set delivery for this item", { exact: true }));
    await user.type(screen.getByLabelText("Delivery fee (KES)"), "200");
    await user.type(screen.getByLabelText("Delivery time (optional)"), "Within 2 hours");
    expect(screen.getByText("Buyers see:", { exact: true }).parentElement).toHaveTextContent("Delivery KES 200 · Arrives: Within 2 hours");
    // A note (Details step)
    await user.click(screen.getByRole("button", { name: /Add a note/ }));
    await user.click(screen.getByText("Warning", { exact: true }));
    await user.type(screen.getByLabelText("Note 1 title"), "Sharp blades");
    await user.type(screen.getByLabelText("Note 1 text"), "Keep away from children.");
    await user.click(screen.getByRole("button", { name: "Save and stay" }));
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 8000 });
    expect(upload).toHaveBeenCalledTimes(2);
    const [, page] = save.mock.calls.at(-1);
    expect(page.delivery).toEqual({ mode: "custom", fee: 200, area: null, time: "Within 2 hours", notes: null, pickup: false });
    expect(page.notices).toEqual([{ tone: "warning", title: "Sharp blades", text: "Keep away from children." }]);
    expect(page.gallery.map((g) => g.label)).toEqual(["Before and after", null]);
    // After the save the form points at saved pictures, and the item's photos are untouched.
    expect(await screen.findByText(/Item saved/, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(gallery).getAllByRole("img")).toHaveLength(2);
  }, 30000);

  it("refuses to save a What's included picture without a name and says where", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(mock, "saveItemPage");
    await signedInApp("/business/catalog/it-fade/edit");
    await screen.findByLabelText("Name");
    const box = document.querySelector('[data-area="includes"]');
    await user.click(within(box).getByRole("button", { name: /Add included item/ }));
    await user.click(within(box).getByTitle(/Add a picture/));
    fireEvent.change(within(box).getByText(/Upload a picture/).querySelector("input"), { target: { files: [png("remote.png")] } });
    await waitFor(() => expect(within(box).getByRole("img", { name: /Picture for Included item 1/ })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Save and stay" }));
    expect(await screen.findAllByText(/Give this picture a name/)).not.toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    await user.type(within(box).getByLabelText("Included item 1"), "Remote control");
    await user.click(screen.getByRole("button", { name: "Save and stay" }));
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 8000 });
    expect(save.mock.calls.at(-1)[1].includeMedia).toHaveLength(1);
  }, 30000);
});

describe("From the brand in the editor", () => {
  it("sets only the banner and the achievement cards: the old story blocks are not offered", async () => {
    const { render } = await import("@testing-library/react");
    const { default: BrandEditor } = await import("./BrandEditor.jsx");
    const extras = { pic: () => null, add: vi.fn(), saved: [], version: 0 };
    render(<BrandEditor brand={{ banner: null, cards: [] }} onBrand={() => {}} extras={extras} />);
    expect(screen.getByRole("heading", { name: /from the brand/i })).toBeInTheDocument();
    expect(screen.queryByText(/brand story/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add block/i })).not.toBeInTheDocument();
  });
});
