// A combination's own quantity prices: edited in the combinations list, sent with the row, cleared again.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { checkOptions, optionsPayload, rowTiersFromStored, rowTiersProblem, rowTiersToStored } from "@epicmkt/shared";
import OptionsStep from "./steps/OptionsStep.jsx";

vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: [], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));

function Harness({ spy, priceType = "from" }) {
  const [form, setForm] = useState({ productTypeId: null, priceType, price: "50", options: undefined });
  spy.current = form;
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}

const setup = async (priceType) => {
  const spy = { current: null };
  const user = userEvent.setup();
  render(<Harness spy={spy} priceType={priceType} />);
  await user.click(screen.getByRole("button", { name: /^(Add )?Size$/ }));
  await user.type(within(screen.getByRole("group", { name: "Values for Size" })).getByLabelText("Add a value"), "A4, A3{Enter}");
  return { spy, user };
};

describe("pure helpers", () => {
  it("text rows -> stored tiers and back", () => {
    const rows = [{ from: "1", price: "50" }, { from: "10", price: "45" }];
    const stored = rowTiersToStored(rows);
    expect(stored).toEqual([{ minQty: 1, maxQty: 9, unitPrice: 50 }, { minQty: 10, maxQty: null, unitPrice: 45 }]);
    expect(rowTiersFromStored(stored)).toEqual(rows);
    expect(rowTiersToStored([{ from: "1", price: "" }])).toBeNull();
  });

  it("says what is wrong, and nothing for no rows", () => {
    expect(rowTiersProblem([])).toBe("");
    expect(rowTiersProblem([{ from: "1", price: "50" }])).toMatch(/at least two/i);
    expect(rowTiersProblem([{ from: "1", price: "50" }, { from: "", price: "40" }])).toMatch(/whole numbers/i);
    expect(rowTiersProblem([{ from: "1", price: "50" }, { from: "10", price: "60" }])).not.toBe("");
    expect(rowTiersProblem([{ from: "1", price: "50" }, { from: "10", price: "45" }])).toBe("");
  });
});

describe("the combinations list", () => {
  it("offers own quantity prices only for a 'Starting from' item", async () => {
    await setup("fixed");
    expect(screen.queryByText(/Own quantity prices/)).toBeNull();
  });

  it("sends a combination's own tiers with its row, and nothing for the others", async () => {
    const { spy, user } = await setup("from");
    const a4 = screen.getAllByText(/Own quantity prices/)[0].closest("details");
    await user.click(within(a4).getByRole("button", { name: /Add a quantity price for/ }));
    await user.click(within(a4).getByRole("button", { name: /Add a quantity price for/ }));
    await user.type(within(a4).getByLabelText(/tier 1 price each/), "50");
    await user.type(within(a4).getByLabelText(/tier 2 from quantity/), "10");
    await user.type(within(a4).getByLabelText(/tier 2 price each/), "45");
    const payload = optionsPayload(spy.current.options);
    const withTiers = payload.variants.filter((v) => v.priceTiers);
    expect(withTiers).toHaveLength(1);
    expect(withTiers[0].priceTiers).toEqual([{ minQty: 1, maxQty: 9, unitPrice: 50 }, { minQty: 10, maxQty: null, unitPrice: 45 }]);
    expect(payload.variants.filter((v) => !v.priceTiers).every((v) => !("priceTiers" in v))).toBe(true);
    expect(checkOptions(spy.current.options).ok).toBe(true);
  });

  it("refuses an incomplete table, and 'use the item's' clears it", async () => {
    const { spy, user } = await setup("from");
    const a4 = screen.getAllByText(/Own quantity prices/)[0].closest("details");
    await user.click(within(a4).getByRole("button", { name: /Add a quantity price for/ }));
    expect(Object.values(checkOptions(spy.current.options).errors).join(" ")).toMatch(/at least two/i);
    await user.click(within(a4).getByRole("button", { name: /Use the item's quantity prices/ }));
    expect(checkOptions(spy.current.options).ok).toBe(true);
    expect(optionsPayload(spy.current.options, true).variants.every((v) => v.priceTiers === null || !("priceTiers" in v))).toBe(true);
  });
});

describe("the mock API keeps a combination's own tiers", () => {
  it("saves them with the item, reads them back, and refuses them on a fixed price", async () => {
    const api = await import("../../../../api/index.js");
    const mock = await import("../../../../api/mock.js");
    mock.resetMock();
    await api.login("ES100001", "Demo-Passw0rd");
    const axes = [{ key: "size", label: "Size", display: "button", values: [{ id: "a4", label: "A4" }, { id: "a3", label: "A3" }] }];
    const tiers = [{ minQty: 1, maxQty: 9, unitPrice: 50 }, { minQty: 10, maxQty: null, unitPrice: 45 }];
    const body = (priceType, priceTiers) => ({ productTypeId: "other", name: "Printing", description: "", section: "", priceType, price: 50, availability: "available",
      options: { axes, variants: [{ choice: { size: "a4" }, price: 50, ...(priceTiers !== undefined ? { priceTiers } : {}) }, { choice: { size: "a3" }, price: 90 }], defaultChoice: null } });
    const id = await api.saveItem(null, body("from", tiers));
    expect((await api.getItemTiers(id)).variants).toEqual([{ choice: { size: "a4" }, tiers }]);
    await api.saveItem(id, body("from", null));
    expect((await api.getItemTiers(id)).variants).toEqual([]);
    await expect(api.saveItem(id, body("fixed", tiers))).rejects.toMatchObject({ code: "tiers_need_from_price" });
  });
});
