import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import * as api from "../../../api/index.js";
import * as mock from "../../../api/mock.js";
import { M, signedInApp } from "../../../test/utils.jsx";

const BULB = { id: "pt-bulb", name: "Bulb", specRows: [
  { key: "wattage", label: "Wattage", level: "required", input: "text" },
  { key: "base", label: "Base", level: "required", input: "choice", choices: ["E27", "E14"] }
] };
const SHIRT = { id: "pt-shirt", name: "Shirt", specRows: [] };
vi.mock("./editor/steps/useProductTypes.js", () => ({
  useProductTypes: () => ({ business: { id: "b" }, categoryId: "x", types: [BULB, SHIRT], departments: [], loading: false, error: false, retry: () => {} })
}));

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("import by type", () => {
  const openImport = async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog", async () => M.setBusiness({ planKey: "premium" }));
    await user.click(await screen.findByRole("button", { name: /^Import items/ }));
    return { user, dialog: await screen.findByRole("dialog", { name: "Import items" }) };
  };

  it("downloads a template whose columns come from the chosen type", async () => {
    const { user, dialog } = await openImport();
    let blob;
    URL.createObjectURL = vi.fn((b) => { blob = b; return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.selectOptions(within(dialog).getByLabelText("Template for"), "pt-bulb");
    await user.click(within(dialog).getByRole("button", { name: "Download Bulb template" }));
    expect(await blob.text()).toMatch(/^name,price type,price,brand,spec:Wattage,spec:Base\n/);
  });

  it("reports rows missing the type's required rows, and still imports the good ones as drafts", async () => {
    const { user, dialog } = await openImport();
    await user.selectOptions(within(dialog).getByLabelText("Template for"), "pt-bulb");
    const text = ["name\tprice type\tprice\tspec:Wattage\tspec:Base", "Bulb A\tfixed\t100\t9 W\tE27", "Bulb B\tfixed\t110\t12 W\t", "Bulb C\tfixed\tabc\t5 W\tE14"].join("\n");
    fireEvent.change(within(dialog).getByLabelText("Paste rows"), { target: { value: text } });
    await user.click(within(dialog).getByRole("button", { name: "Preview" }));
    expect(await within(dialog).findByTestId("import-summary")).toHaveTextContent("2 ready to import, 1 rejected, 3 rows in total.");
    expect(within(dialog).getByTestId("import-rejected")).toHaveTextContent("must be a number");
    expect(within(dialog).getByTestId("import-unfinished")).toHaveTextContent(/1 row is missing details a bulb needs/);
    expect(within(dialog).getByTestId("import-unfinished")).toHaveTextContent("Row 3: Base");
    const results = await axe(dialog);
    expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});

describe("import with a type", () => {
  it("gives every imported item the chosen type, and none when no type is chosen", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog", async () => M.setBusiness({ planKey: "premium" }));
    const spy = vi.spyOn(mock, "importItems");
    const run = async (typeId) => {
      await user.click(await screen.findByRole("button", { name: /^Import items/ }));
      const dialog = await screen.findByRole("dialog", { name: "Import items" });
      if (typeId) await user.selectOptions(within(dialog).getByLabelText("Template for"), typeId);
      fireEvent.change(within(dialog).getByLabelText("Paste rows"), { target: { value: "name\tprice type\tprice\nPlain shirt\tfixed\t500" } });
      await user.click(within(dialog).getByRole("button", { name: "Preview" }));
      await user.click(await within(dialog).findByRole("button", { name: /^Import 1 item$/ }));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Import items" })).toBeNull());
    };
    await run("pt-shirt");
    expect(spy.mock.calls[0][0][0]).toMatchObject({ name: "Plain shirt", product_type_id: "pt-shirt" });
    expect((await api.getCatalog()).items.find((i) => i.name === "Plain shirt")).toMatchObject({ productTypeId: "pt-shirt" });
    await run("");
    expect("product_type_id" in spy.mock.calls[1][0][0]).toBe(false);
  });
});

describe("bulk set type", () => {
  const selectFirst = async (n = 2) => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const boxes = await screen.findAllByRole("checkbox", { name: /^Select / });
    for (const b of boxes.slice(0, n)) await user.click(b);
    return user;
  };

  it("sets the type on the selected items without touching price or stock", async () => {
    const user = await selectFirst(2);
    const before = (await api.getCatalog()).items.map((i) => [i.id, i.price, i.stockCount]);
    const spy = vi.spyOn(mock, "setItemTypes");
    await user.click(screen.getByRole("button", { name: "Set type" }));
    const dialog = await screen.findByRole("dialog", { name: "Set product type" });
    expect(dialog).toHaveTextContent(/Prices and stock stay as they are/);
    await user.selectOptions(within(dialog).getByLabelText("Product type"), "pt-shirt");
    await user.click(within(dialog).getByRole("button", { name: /Apply|Save|OK|Set/ }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.any(Array), "pt-shirt"));
    const after = (await api.getCatalog()).items;
    expect(after.filter((i) => i.productTypeId === "pt-shirt").length).toBe(spy.mock.calls[0][0].length);
    expect(after.map((i) => [i.id, i.price, i.stockCount])).toEqual(before);
    expect(await screen.findByText(/items? updated\./)).toBeInTheDocument();
  });
});
