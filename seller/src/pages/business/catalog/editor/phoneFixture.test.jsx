// 11.2: the phone fixture (Black 25,000, Grey 24,000, three storages, two stock states) built through the real Options step
// saves the same options the shared contract fixture holds.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { optionsPayload, storedOptions, getFixtures } from "@epicmkt/shared";
import OptionsStep from "./steps/OptionsStep.jsx";
import { visibleSteps } from "./steps/index.js";

vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: [], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));

function Harness({ spy }) {
  const [form, setForm] = useState({ productTypeId: "phone", price: "", options: undefined });
  spy.current = form;
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}

const build = async () => {
  const spy = { current: null };
  const user = userEvent.setup();
  render(<Harness spy={spy} />);
  const axis = async (preset, values) => {
    await user.click(screen.getByRole("button", { name: new RegExp(`^(Add )?${preset}$`) }));
    await user.type(within(screen.getByRole("group", { name: `Values for ${preset}` })).getByLabelText("Add a value"), `${values}{Enter}`);
  };
  await axis("Colour", "Black, Grey");
  await axis("Storage", "64 GB, 128 GB, 256 GB");
  await user.click(screen.getByRole("checkbox", { name: "Colour" }));   // what changes the price: the colour only
  const list = screen.getByRole("list", { name: "Price by Colour" });
  await user.type(within(list).getByLabelText("Black price"), "25000");
  await user.type(within(list).getByLabelText("Grey price"), "24000");
  return { spy, user };
};

describe("11.2 the phone fixture through the real steps", () => {
  it("lists the steps in the agreed order for a typed item", () => {
    const ids = visibleSteps({ form: { productTypeId: "phone", options: { axes: [{ key: "colour" }], rows: [], defaultKey: null } }, errors: {}, mediaCount: 1 }).map((s) => s.id);
    const order = ["media", "basics", "options", "price", "details", "review"].filter((id) => ids.includes(id));
    expect(ids.filter((id) => order.includes(id))).toEqual(order);
  });

  it("saves the same axes, prices and stock as the contract fixture", async () => {
    const { spy, user } = await build();
    const labelOf = (key) => spy.current.options.rows.find((r) => Object.values(r.choice).join("|") === key);
    expect(labelOf("black|64-gb").price).toBe("25000");
    // the two stock states of the fixture: Black 256 GB sold out, Grey 256 GB nearly gone
    await user.type(screen.getByLabelText(/Black.*256 GB.*stock|256 GB.*Black.*stock/i), "0");
    await user.type(screen.getByLabelText(/Grey.*256 GB.*stock|256 GB.*Grey.*stock/i), "3");

    const payload = optionsPayload(spy.current.options);
    const stored = storedOptions(payload);
    expect(stored.ok).toBe(true);

    const detail = getFixtures().find((f) => f.id === "fx-phone").detail;
    const want = detail.options;
    expect(want.length).toBe(2);
    // axes: key, label, display and ordered values
    expect(stored.value.axes.map((a) => ({ key: a.key, label: a.label, values: a.values.map((v) => v.id) }))).toEqual(want.map((a) => ({ key: a.key, label: a.label, values: a.values.map((v) => v.id) })));
    // prices per combination
    const priceOf = (list) => Object.fromEntries(list.map((v) => [`${v.choice.colour}|${v.choice.storage}`, Number(v.price)]));
    expect(priceOf(stored.value.variants)).toEqual(priceOf(detail.optionVariants));
    expect(priceOf(stored.value.variants)["grey|256-gb"]).toBe(24000);
    // stock: the fixture's sold-out and nearly-gone combinations carry the same counts the seller typed
    const stockOf = (list, key) => list.find((v) => `${v.choice.colour}|${v.choice.storage}` === key);
    expect(Number(stockOf(stored.value.variants, "black|256-gb").stock)).toBe(0);
    expect(stockOf(detail.optionVariants, "black|256-gb").status).toBe("out_of_stock");
    expect(Number(stockOf(stored.value.variants, "grey|256-gb").stock)).toBe(3);
    expect(stockOf(detail.optionVariants, "grey|256-gb").status).toBe("limited_stock");
    expect(stored.value.variants).toHaveLength(detail.optionVariants.length);
  });
});
