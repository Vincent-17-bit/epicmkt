import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyItemForm, emptyOptionsForm } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import * as mock from "../../../../api/mock.js";
import { ApiError } from "../../../../api/errors.js";
import { errorText } from "../../../../lib/errors.js";
import { signedInApp } from "../../../../test/utils.jsx";
import { specToOption } from "./specOptions.js";
import { previewPayload } from "./previewPayload.js";

afterEach(() => vi.restoreAllMocks());

describe("the editor stays open", () => {
  it("keeps the form when a background refresh of the list fails, instead of 'We could not open the editor'", async () => {
    const user = userEvent.setup();
    const { client } = await signedInApp("/business/catalog/it-fade/edit");
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Fade cut deluxe");
    vi.spyOn(mock, "getCatalog").mockRejectedValue(new ApiError("request_failed", "TypeError: Failed to fetch"));
    await client.invalidateQueries({ queryKey: ["catalog"] });
    await waitFor(() => expect(mock.getCatalog).toHaveBeenCalled());
    expect(screen.queryByText("We could not open the editor")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Fade cut deluxe");
  });

  it("says so, with the shop and EpicMKT Seller still shown, when the list never loaded", async () => {
    vi.spyOn(mock, "getCatalog").mockRejectedValue(new ApiError("request_failed", "TypeError: Failed to fetch"));
    await signedInApp("/business/catalog/new");
    expect(await screen.findByText("We could not open the editor", {}, { timeout: 12000 })).toBeInTheDocument();
    expect(screen.getByTestId("editor-brand")).toHaveTextContent("EpicMKT Seller");
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to your listings" })).toHaveAttribute("href", "/business/catalog");
  }, 20000);
});

describe("specifications that buyers choose between become options", () => {
  it("turns 'Brand: Festive, Supa Loaf' and 'Weight: 400 g, 700 g, 900 g' into two option types with six priced rows", () => {
    const a = specToOption(emptyOptionsForm(), "Brand", "Festive, Supa Loaf");
    expect(a.count).toBe(2);
    const b = specToOption(a.options, "Weight", "400 g, 700 g, 900 g");
    expect(b.options.axes.map((x) => [x.label, x.values.map((v) => v.label)])).toEqual([["Brand", ["Festive", "Supa Loaf"]], ["Weight", ["400 g", "700 g", "900 g"]]]);
    expect(b.options.rows).toHaveLength(6);
    // the same type again only adds what is missing
    expect(specToOption(b.options, "weight", "900 g, 1 kg").options.axes[1].values.map((v) => v.label)).toEqual(["400 g", "700 g", "900 g", "1 kg"]);
  });
  it("gives colours their swatch from the name and refuses an empty value", () => {
    const r = specToOption(null, "Color", "Black, Grey, Rose gold");
    expect(r.options.axes[0].display).toBe("swatch");
    expect(r.options.axes[0].values.map((v) => v.color)).toEqual(["#111111", "#8a8d91", "#b76e79"]);
    expect(specToOption(null, "Color", "  ").error).toMatch(/Type the choices/);
  });
});

describe("the live preview sends the real page what a buyer would get", () => {
  it("builds the public row, the option payload with each combination's price, and keeps unsent photos as files", () => {
    const opts = specToOption(specToOption(null, "Brand", "Festive, Supa Loaf").options, "Weight", "400 g, 700 g").options;
    const prices = { "festive|400-g": "65", "festive|700-g": "100", "supa-loaf|400-g": "60", "supa-loaf|700-g": "130" };
    opts.rows = opts.rows.map((r) => ({ ...r, price: prices[`${r.choice.brand}|${r.choice.weight}`] ?? "" }));
    const file = new File(["x"], "bread.jpg", { type: "image/jpeg" });
    const form = { ...emptyItemForm(), name: "White bread", priceType: "from", price: "60", highlights: [{ title: "Fresh", text: "Baked daily" }], includes: ["Loaf", ""], options: opts };
    const p = previewPayload({ form, tiles: [{ key: "m1", kind: "image", status: "ready", file, url: "blob:x" }, { key: "m2", kind: "image", status: "saved", path: "a/b/c", id: "id-2" }], shop: { slug: "sunrise" } });
    expect(p.row).toMatchObject({ name: "White bread", price: 60, price_type: "from", has_options: true, option_count: 4, price_min: 60, price_high: 130, includes: ["Loaf"] });
    expect(p.row.highlights).toEqual([{ title: "Fresh", text: "Baked daily" }]);
    expect(p.options.optionVariants.map((v) => [v.label, v.price])).toEqual([["Festive / 400 g", 65], ["Festive / 700 g", 100], ["Supa Loaf / 400 g", 60], ["Supa Loaf / 700 g", 130]]);
    expect(p.media[0].blob).toBe(file);
    expect(p.media[1]).toEqual({ id: "id-2", kind: "image", path: "a/b/c" });
    expect(p.business.slug).toBe("sunrise");
  });
});

describe("server-side problems are named, not 'check your connection'", () => {
  it("names a function that is not deployed, and a blocked request", () => {
    expect(errorText(new ApiError("function_missing", "seller-media-ticket", { fn: "seller-media-ticket" }))).toMatch(/seller-media-ticket is not deployed/);
    expect(errorText(new ApiError("service_unreachable", "x", { fn: "seller-media3d-finalize" }))).toMatch(/could not reach the EpicMKT server \(seller-media3d-finalize\)/);
    expect(errorText(new ApiError("server_error", "", { fn: "seller-media-ticket" }))).toMatch(/server could not finish that/);
  });
});

describe("what's included lines keep their photos", () => {
  it("saves a photo chosen for an included line with the item", async () => {
    await signedInApp("/business/catalog/it-fade/edit");
    const media = await api.listItemMedia("it-fade");
    await api.saveItemIncludeMedia("it-fade", [media[0].id, null]);
    const item = (await api.getCatalog()).items.find((i) => i.id === "it-fade");
    expect(item.includeMedia).toEqual([media[0].id, null]);
    await expect(api.saveItemIncludeMedia("it-fade", ["not-a-photo"])).rejects.toMatchObject({ code: "invalid_details" });
    await screen.findByLabelText("Name");
    expect(within(document.body).getAllByText(/What is included/).length).toBeGreaterThan(0);
  });
});
