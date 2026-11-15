import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { signedInApp } from "../../../../test/utils.jsx";
import * as mock from "../../../../api/mock.js";
import TiersEditor from "./TiersEditor.jsx";
import { tiersOf } from "./model/tiers.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
function Harness({ start = null }) {
  const [state, setState] = useState(start);
  return <><TiersEditor state={state} onChange={setState} unit="page" /><output data-testid="json">{JSON.stringify(state && tiersOf(state.rows))}</output></>;
}
const fill = async (user, label, text) => { const el = screen.getByLabelText(label); await user.clear(el); await user.type(el, text); };

describe("quantity prices editor", () => {
  it("is off until the seller turns it on, then shows two rows and the mode", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /less each one costs/ }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByLabelText("Tier 1 from quantity")).toHaveValue("1");
    expect(screen.getByRole("radio", { name: /Whole order/ })).toBeChecked();
  });

  it("previews the same quantity both ways and follows the typing", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("checkbox"));
    await fill(user, "Tier 1 price each (KES)", "10");
    await fill(user, "Tier 2 from quantity", "11");
    await fill(user, "Tier 2 price each (KES)", "7");
    expect(screen.getByTestId("tier-preview")).toHaveTextContent("50 pages = KES 350 (whole) or KES 380 (graduated)");
    await user.click(screen.getByRole("button", { name: "Add another quantity price" }));
    await fill(user, "Tier 3 from quantity", "101");
    await fill(user, "Tier 3 price each (KES)", "5");
    expect(screen.getByTestId("json")).toHaveTextContent('[{"minQty":1,"maxQty":10,"unitPrice":10},{"minQty":11,"maxQty":100,"unitPrice":7},{"minQty":101,"maxQty":null,"unitPrice":5}]');
    await user.click(screen.getByRole("button", { name: "Remove tier 3" }));
    expect(screen.queryByLabelText("Tier 3 from quantity")).not.toBeInTheDocument();
  });

  it("shows what is wrong beside the row, and no preview while there is a problem", async () => {
    const user = userEvent.setup();
    render(<Harness start={{ mode: "whole", rows: [{ from: "1", price: "10" }, { from: "1", price: "12" }] }} />);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(/Must be more than 1|A bigger quantity should not cost more each/);
    expect(screen.queryByTestId("tier-preview")).not.toBeInTheDocument();
    await fill(user, "Tier 2 from quantity", "11");
    await fill(user, "Tier 2 price each (KES)", "7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("tier-preview")).toBeInTheDocument();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = render(<Harness start={{ mode: "graduated", rows: [{ from: "1", price: "10" }, { from: "11", price: "7" }] }} />);
    expect((await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});

describe("demo twin of the tier save", () => {
  it("stores, reads back and clears tiers; refuses a price type that is not From and invalid tiers", async () => {
    await signedInApp("/business/catalog");
    const items = await mock.listItems();
    const it = items[0];
    const base = (o) => ({ name: it.name, description: "", section: null, priceType: "from", price: 10, unit: "page", availability: "available", ...o });
    const T = [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: null, unitPrice: 7 }];
    await mock.saveItem(it.id, base({ priceTiers: T, priceTierMode: "graduated" }));
    expect(await mock.getItemTiers(it.id)).toEqual({ tiers: T, mode: "graduated", variants: [] });
    await expect(mock.saveItem(it.id, base({ priceType: "fixed", priceTiers: T, priceTierMode: "whole" }))).rejects.toThrow(/tiers_need_from_price/);
    await expect(mock.saveItem(it.id, base({ priceTiers: [{ minQty: 2, maxQty: null, unitPrice: 5 }], priceTierMode: "whole" }))).rejects.toThrow(/invalid_price_tiers/);
    await mock.saveItem(it.id, base({ priceTiers: null }));
    expect((await mock.getItemTiers(it.id)).tiers).toBeNull();
  });
});
