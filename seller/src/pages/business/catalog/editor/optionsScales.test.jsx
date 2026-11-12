// Stored scales (migration 0100): a value typed on a scale axis keeps its scale value, the save sends it, an older database still saves,
// and reading the item back keeps it. Runs through the real Options step and the real editor against the mock API.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { optionsPayload } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { signedInApp } from "../../../../test/utils.jsx";
import OptionsStep from "./steps/OptionsStep.jsx";
import { saveWithScaleFallback } from "./saveFallback.js";

vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: window.__types ?? [], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));

const phone = { id: "pt-phone", name: "Phone", axes: [{ key: "colour", label: "Colour", display: "swatch" }, { key: "storage", label: "Storage", display: "button", scale: "storage" }] };

function Harness({ spy }) {
  const [form, setForm] = useState({ productTypeId: "pt-phone", price: "1000" });
  spy.current = form;
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}
const addValues = async (user, axisName, text) => {
  const group = screen.getByRole("group", { name: `Values for ${axisName}` });
  await user.type(within(group).getByLabelText("Add a value"), `${text}{Enter}`);
};
beforeEach(() => { window.__types = [phone]; });
afterEach(() => { window.__types = undefined; });

describe("scale values in the Options step", () => {
  it("a value typed on a scale axis keeps the scale value it was read as, and sends it", async () => {
    const spy = { current: null };
    const user = userEvent.setup();
    render(<Harness spy={spy} />);
    await user.click(screen.getByRole("button", { name: /Use the usual options/ }));
    await addValues(user, "Storage", "128gb, 1024 GB");
    const storage = spy.current.options.axes[1];
    expect(storage.values.map((v) => [v.label, v.scaleValue])).toEqual([["128 GB", { scale: "storage", value: 128, unit: "GB" }], ["1 TB", { scale: "storage", value: 1024, unit: "GB" }]]);
    const sent = optionsPayload(spy.current.options, true).axes;
    expect(sent[1].scale).toBe("storage");
    expect(sent[1].values[1].scaleValue).toEqual({ scale: "storage", value: 1024, unit: "GB" });
    expect("scale" in sent[0]).toBe(false);          // Colour has no scale
  });

  it("a plain axis keeps plain values (nothing is added)", async () => {
    const spy = { current: null };
    const user = userEvent.setup();
    render(<Harness spy={spy} />);
    await user.click(screen.getByRole("button", { name: /Use the usual options/ }));
    await addValues(user, "Colour", "Black, Grey");
    expect(spy.current.options.axes[0].values.every((v) => !("scaleValue" in v))).toBe(true);
  });
});

describe("saving from the editor", () => {
  const named = async (name) => (await api.listItems()).find((i) => i.name === name);
  it("saves a phone with storage sizes, and the stored scale values come back when it is read", async () => {
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/new");
    router.navigate("/business/catalog/new", { state: { productTypeId: "pt-phone" } });
    await screen.findByLabelText("Name");
    await user.type(screen.getByLabelText("Name"), "Galaxy A");
    await user.type(screen.getByLabelText("Price (KES)"), "20000");
    await user.click(within(document.getElementById("sec-options")).getByRole("button", { name: /Use the usual options/ }));
    await addValues(user, "Colour", "Black");
    await addValues(user, "Storage", "128gb, 1024 GB");
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(async () => expect(await named("Galaxy A")).toBeTruthy(), { timeout: 5000 });
    const saved = await api.getItemOptions((await named("Galaxy A")).id);
    expect(saved.axes[1].scale).toBe("storage");
    expect(saved.axes[1].values.map((v) => v.scaleValue)).toEqual([{ scale: "storage", value: 128, unit: "GB" }, { scale: "storage", value: 1024, unit: "GB" }]);
    expect(saved.axes[0].scale).toBeUndefined();

    // editing the item loads them again, so a re-save (here: only the name changes) does not lose them
    await router.navigate(`/business/catalog/${(await named("Galaxy A")).id}/edit`);
    const nameBox = (await screen.findAllByLabelText("Name"))[0];   // the item name; each option type also has a Name box
    expect(nameBox).toHaveValue("Galaxy A");
    await user.type(nameBox, " 2");
    await user.click(screen.getAllByRole("button", { name: /Save changes|Save and stay|Save as draft/ })[0]);
    await waitFor(async () => expect(await named("Galaxy A 2")).toBeTruthy(), { timeout: 5000 });
    const again = await api.getItemOptions((await named("Galaxy A 2")).id);
    expect(again.axes[1].scale).toBe("storage");
    expect(again.axes[1].values[1].scaleValue).toEqual({ scale: "storage", value: 1024, unit: "GB" });
  });
});

describe("saveWithScaleFallback (a database without migration 0100)", () => {
  const body = { name: "x", options: { axes: [{ key: "storage", label: "Storage", display: "button", scale: "storage", values: [{ id: "a", label: "1 TB", scaleValue: { scale: "storage", value: 1024, unit: "GB" } }] }], variants: [] } };
  const refuse = () => Object.assign(new Error("invalid_options"), { code: "invalid_options" });

  it("saves once when the database accepts it", async () => {
    const save = vi.fn(async () => "id-1");
    expect(await saveWithScaleFallback(save, body)).toBe("id-1");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].options.axes[0].scale).toBe("storage");
  });

  it("tries again without scale data when the database refuses the options, so the seller can still save", async () => {
    const save = vi.fn().mockRejectedValueOnce(refuse()).mockResolvedValueOnce("id-2");
    expect(await saveWithScaleFallback(save, body)).toBe("id-2");
    expect(save).toHaveBeenCalledTimes(2);
    const second = save.mock.calls[1][0].options.axes[0];
    expect("scale" in second).toBe(false);
    expect("scaleValue" in second.values[0]).toBe(false);
    expect(second.values[0].label).toBe("1 TB");
  });

  it("if the second try fails too, that error is the one the seller sees", async () => {
    const second = Object.assign(new Error("invalid_options"), { code: "invalid_options", marker: 2 });
    const save = vi.fn().mockRejectedValueOnce(refuse()).mockRejectedValueOnce(second);
    await expect(saveWithScaleFallback(save, body)).rejects.toBe(second);
  });

  it("does not retry other errors, or an invalid_options when there was no scale data", async () => {
    const other = Object.assign(new Error("nope"), { code: "item_not_found" });
    const a = vi.fn().mockRejectedValue(other);
    await expect(saveWithScaleFallback(a, body)).rejects.toBe(other);
    expect(a).toHaveBeenCalledTimes(1);
    const plain = { name: "x", options: { axes: [{ key: "c", label: "C", display: "button", values: [{ id: "a", label: "A" }] }], variants: [] } };
    const b = vi.fn().mockRejectedValue(refuse());
    await expect(saveWithScaleFallback(b, plain)).rejects.toMatchObject({ code: "invalid_options" });
    expect(b).toHaveBeenCalledTimes(1);
    const c = vi.fn().mockRejectedValue(refuse());
    await expect(saveWithScaleFallback(c, { name: "x" })).rejects.toMatchObject({ code: "invalid_options" });
    expect(c).toHaveBeenCalledTimes(1);
  });
});
