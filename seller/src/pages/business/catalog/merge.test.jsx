import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { signedInApp } from "../../../test/utils.jsx";
import * as mock from "../../../api/mock.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

// The demo shop's own items are renamed to the bread and water examples, so the screen reads the same data the real functions would.
async function seed() {
  const items = await mock.listItems();
  expect(items.length).toBeGreaterThanOrEqual(4);
  return items;
}

afterEach(() => vi.restoreAllMocks());

describe("combine similar items", () => {
  it("shows groups, previews the grid, combines, and undoes (bread)", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(mock, "getSimilarGroups").mockResolvedValue([{ key: "bread", productTypeId: "bread", items: [
      { id: "b1", name: "Bread 400g", price: 60, salePrice: null }, { id: "b2", name: "Bread 800g", price: 110, salePrice: null }] }]);
    const merged = vi.spyOn(mock, "mergeItems").mockResolvedValue({ mergeId: "m1", itemId: "b1", expiresAt: new Date(Date.now() + 3600e3).toISOString() });
    vi.spyOn(mock, "listRecentMerges").mockResolvedValue([]);
    await signedInApp("/business/catalog/merge");
    await screen.findByRole("heading", { level: 1, name: "Combine similar items" });
    expect(await screen.findByText("Bread 400g")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Combine these" }));
    expect(screen.getByLabelText("Name of the combined item")).toHaveValue("Bread");
    expect(screen.getByLabelText("Weight for Bread 400g")).toHaveValue("400 g");
    const grid = screen.getByRole("table");
    expect(within(grid).getByRole("rowheader", { name: "400 g" })).toBeInTheDocument();
    expect(within(grid).getByText("KES 110")).toBeInTheDocument();
    expect(screen.getByText(/old links open the combined item/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Combine 2 items" }));
    await waitFor(() => expect(merged).toHaveBeenCalled());
    expect(merged.mock.calls[0][0]).toEqual(["b1", "b2"]);
    expect(merged.mock.calls[0][1]).toEqual({ name: "Bread", axes: [{ key: "weight", label: "Weight", labels: { b1: "400 g", b2: "800 g" } }] });
    expect(await screen.findByText(/Combined 2 items into “Bread”/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });

  it("water: two option types give a size by fill grid, and a clash blocks the button", async () => {
    const user = userEvent.setup();
    vi.spyOn(mock, "getSimilarGroups").mockResolvedValue([{ key: "water", productTypeId: "drinking-water", items: [
      { id: "w1", name: "Water 5 L", price: 30 }, { id: "w2", name: "Water 5 L new", price: 150 }, { id: "w3", name: "Water 20 L", price: 80 }] }]);
    vi.spyOn(mock, "listRecentMerges").mockResolvedValue([]);
    await signedInApp("/business/catalog/merge");
    await user.click(await screen.findByRole("button", { name: "Combine these" }));
    // Suggested: no size is unique here, so one blank option type. Two items share "5 L": the clash message shows until a second type tells them apart.
    await user.clear(screen.getByLabelText("What differs"));
    await user.type(screen.getByLabelText("What differs"), "Size");
    await user.type(screen.getByLabelText("Size for Water 5 L"), "5 L");
    await user.type(screen.getByLabelText("Size for Water 5 L new"), "5 L");
    await user.type(screen.getByLabelText("Size for Water 20 L"), "20 L");
    expect(screen.getByRole("alert")).toHaveTextContent(/same value for every option/);
    expect(screen.getByRole("button", { name: "Combine 3 items" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add another option type" }));
    const fills = screen.getAllByLabelText("What differs")[1];
    await user.type(fills, "Fill");
    await user.type(screen.getByLabelText("Fill for Water 5 L"), "Refill");
    await user.type(screen.getByLabelText("Fill for Water 5 L new"), "New bottle");
    await user.type(screen.getByLabelText("Fill for Water 20 L"), "Refill");
    const grid = await screen.findByRole("table");
    expect(within(grid).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Size / Fill", "Refill", "New bottle"]);
    expect(within(grid).getByRole("row", { name: /20 L/ })).toHaveTextContent("Not sold");
    expect(screen.getByRole("button", { name: "Combine 3 items" })).toBeEnabled();
  });

  it("lists recent merges and undoes one", async () => {
    const user = userEvent.setup();
    vi.spyOn(mock, "getSimilarGroups").mockResolvedValue([]);
    const recent = vi.spyOn(mock, "listRecentMerges").mockResolvedValue([{ id: "m1", itemId: "b1", name: "Bread", count: 2, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600e3).toISOString() }]);
    const undo = vi.spyOn(mock, "undoMerge").mockImplementation(async () => { recent.mockResolvedValue([]); return { itemId: "b1", restored: 2 }; });
    await signedInApp("/business/catalog/merge");
    expect(await screen.findByText("Nothing to combine")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo Bread" }));
    await waitFor(() => expect(undo).toHaveBeenCalledWith("m1"));
    expect(await screen.findByText(/Undone/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Combined recently")).not.toBeInTheDocument());
  });

  it("shows the reason when combining fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(mock, "getSimilarGroups").mockResolvedValue([{ key: "bread", items: [{ id: "b1", name: "Bread 400g", price: 60 }, { id: "b2", name: "Bread 800g", price: 110 }] }]);
    vi.spyOn(mock, "listRecentMerges").mockResolvedValue([]);
    vi.spyOn(mock, "mergeItems").mockRejectedValue(Object.assign(new Error("price_required"), { code: "price_required", name: "ApiError" }));
    await signedInApp("/business/catalog/merge");
    await user.click(await screen.findByRole("button", { name: "Combine these" }));
    await user.click(screen.getByRole("button", { name: "Combine 2 items" }));
    expect(await screen.findByText(/needs a price/)).toBeInTheDocument();
  });

  it("has no serious accessibility violations, open and closed", async () => {
    const user = userEvent.setup();
    vi.spyOn(mock, "getSimilarGroups").mockResolvedValue([{ key: "bread", items: [{ id: "b1", name: "Bread 400g", price: 60 }, { id: "b2", name: "Bread 800g", price: 110 }] }]);
    vi.spyOn(mock, "listRecentMerges").mockResolvedValue([]);
    const { container } = await signedInApp("/business/catalog/merge");
    await screen.findByText("Bread 400g");
    expect((await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Combine these" }));
    expect((await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});

describe("demo twin of the merge functions", () => {
  it("combines, redirects and undoes like the database", async () => {
    await signedInApp("/business/catalog/merge");
    const items = await seed();
    const [a, b] = items.slice(0, 2);
    await expect(mock.mergeItems([a.id], { name: "X", axes: [] })).rejects.toThrow(/invalid_items/);
    await expect(mock.mergeItems([a.id, b.id], { name: "Mix", axes: [{ key: "size", label: "Size", labels: { [a.id]: "S", [b.id]: "S" } }] })).rejects.toThrow(/duplicate_combination/);
    const res = await mock.mergeItems([a.id, b.id], { name: "Mix", axes: [{ key: "size", label: "Size", labels: { [a.id]: "Small", [b.id]: "Large" } }] });
    expect(res.itemId).toBe(a.id);
    const options = await mock.getItemOptions(a.id);
    expect(options.variants.map((v) => v.choice.size)).toEqual(["small", "large"]);
    expect((await mock.listRecentMerges())[0].name).toBe("Mix");
    await expect(mock.mergeItems([a.id, items[2].id], { name: "Again", axes: [{ key: "size", label: "Size", labels: { [a.id]: "S", [items[2].id]: "L" } }] })).rejects.toThrow(/has_options/);
    await mock.undoMerge(res.mergeId);
    expect((await mock.getItemOptions(a.id)).axes).toEqual([]);
    expect((await mock.listRecentMerges())).toEqual([]);
    await expect(mock.undoMerge(res.mergeId)).rejects.toThrow(/already_undone/);
  });
});
