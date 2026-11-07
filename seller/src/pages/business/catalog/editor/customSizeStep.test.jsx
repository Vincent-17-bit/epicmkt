// B07 (Prompt 3.4): the made-to-measure controls in the Options step. The storage flag is forced on here; see
// docs/requests/2026-11-07-b07-to-data-custom-size-storage.md for why it is off in the app.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { customPrice, customSizePayload, validateCustomSize } from "@epicmkt/shared";
import OptionsStep from "./steps/OptionsStep.jsx";

vi.mock("@epicmkt/shared", async (orig) => ({ ...(await orig()), CUSTOM_SIZE_STORED: true }));
vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: [], planLimits: undefined, departments: [], loading: false, error: false, retry() {} }) }));
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

function Harness({ spy }) {
  const [form, setForm] = useState({ productTypeId: null, price: "1000" });
  spy.current = form;
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}
const open = async () => {
  const spy = { current: null };
  const user = userEvent.setup();
  const view = render(<Harness spy={spy} />);
  await user.click(screen.getByRole("button", { name: "Size" }));
  await user.type(screen.getByLabelText("Add a value"), "S, M{Enter}");
  await user.click(screen.getByRole("switch", { name: /Also offer made to measure/ }));
  return { user, spy, ...view };
};

describe("Made to measure (seller)", () => {
  it("is offered only once there is an option, and starts with no measurements", async () => {
    const { spy } = await open();
    expect(spy.current.customSize).toMatchObject({ enabled: true, axisKey: "size", fields: [] });
    expect(validateCustomSize(spy.current.customSize).errors.fields).toBeTruthy();
  });

  it("adds body measurements in one tap, and a fixed price gives the saved config", async () => {
    const { user, spy } = await open();
    await user.click(screen.getByRole("button", { name: "Body measurements" }));
    expect(spy.current.customSize.fields.map((f) => f.label)).toEqual(["Bust", "Waist", "Hips", "Height"]);
    await user.type(screen.getByLabelText("Base price (KES)"), "4500");
    expect(validateCustomSize(spy.current.customSize).ok).toBe(true);
    const saved = customSizePayload(spy.current.customSize);
    expect(saved.fields).toHaveLength(4);
    expect(customPrice(saved, {})).toBe(4500);
  });

  it("a measurement can be optional and removed", async () => {
    const { user, spy } = await open();
    await user.click(screen.getByRole("button", { name: "Body measurements" }));
    await user.click(screen.getByRole("checkbox", { name: /Required: Height/ }));
    expect(spy.current.customSize.fields[3].required).toBe(false);
    await user.click(screen.getByRole("button", { name: "Remove Height" }));
    expect(spy.current.customSize.fields).toHaveLength(3);
  });

  it("prices per extra cm: needs the measurement, where it starts and the rate", async () => {
    const { user, spy } = await open();
    await user.click(screen.getByRole("button", { name: "Width, depth, height" }));
    await user.selectOptions(screen.getByLabelText("How is it priced?"), "per-extra");
    await user.type(screen.getByLabelText("Base price (KES)"), "30000");
    expect(Object.keys(validateCustomSize(spy.current.customSize).errors).sort()).toEqual(["price.field", "price.over", "price.perUnit"]);
    await user.selectOptions(screen.getByLabelText("Counted on"), "width");
    await user.type(screen.getByLabelText("Extra starts above"), "180");
    await user.type(screen.getByLabelText("Extra price for each unit (KES)"), "100");
    expect(customPrice(customSizePayload(spy.current.customSize), { width: 200 })).toBe(32000);
  });

  it("turning it off saves nothing and keeps what was typed", async () => {
    const { user, spy } = await open();
    await user.click(screen.getByRole("button", { name: "Body measurements" }));
    await user.click(screen.getByRole("switch", { name: /Also offer made to measure/ }));
    expect(customSizePayload(spy.current.customSize)).toBeNull();
    expect(spy.current.customSize.fields).toHaveLength(4);
  });

  it("has no accessibility violations", async () => {
    const { user, container } = await open();
    await user.click(screen.getByRole("button", { name: "Body measurements" }));
    expect((await axe(container)).violations).toEqual([]);
  });
});
