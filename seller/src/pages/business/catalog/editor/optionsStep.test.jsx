// B07 (Prompts 3.2 and 3.3): the Options step. Axes, generated combinations, Not sold, limits, the SanDisk dependent lists, and a save through the editor.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { optionsPayload } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { signedInApp } from "../../../../test/utils.jsx";
import { visibleSteps } from "./steps/index.js";
import OptionsStep from "./steps/OptionsStep.jsx";

vi.mock("./steps/useProductTypes.js", () => ({ useProductTypes: () => ({ types: window.__types ?? [], planLimits: window.__plan, departments: [], loading: false, error: false, retry() {} }) }));
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

function Harness({ initial = {}, spy }) {
  const [form, setForm] = useState({ productTypeId: null, price: "1000", ...initial });
  spy.current = form;
  return <OptionsStep form={form} patch={(k, v) => setForm((f) => ({ ...f, [k]: v }))} errors={{}} />;
}
const setup = (initial) => { const spy = { current: null }; const user = userEvent.setup(); const view = render(<Harness initial={initial} spy={spy} />); return { user, spy, ...view }; };
const addAxis = async (user, preset) => user.click(screen.getByRole("button", { name: new RegExp(`^(Add )?${preset}$`) }));
const addValues = async (user, axisName, text) => {
  const group = screen.getByRole("group", { name: `Values for ${axisName}` });
  await user.type(within(group).getByLabelText("Add a value"), `${text}{Enter}`);
};
beforeEach(() => { window.__plan = undefined; window.__types = undefined; });
afterEach(() => { window.__plan = undefined; window.__types = undefined; });

describe("steps registry", () => {
  it("shows the step only for a typed item or one that has options", () => {
    const ids = (form) => visibleSteps({ form, errors: {}, mediaCount: 0 }).map((s) => s.id);
    expect(ids({ name: "x" })).not.toContain("options");
    expect(ids({ productTypeId: null })).toContain("options");
    expect(ids({ options: { axes: [], rows: [], defaultKey: null } })).toContain("options");
  });
});

describe("Options step", () => {
  it("starts from a preset and generates 3 x 3 combinations, with the summary", async () => {
    const { user, spy } = setup();
    await addAxis(user, "Colour");
    await addValues(user, "Colour", "Black, Grey, Blue");
    await addAxis(user, "Storage");
    await addValues(user, "Storage", "128 GB, 256 GB, 512 GB");
    expect(spy.current.options.rows).toHaveLength(9);
    expect(screen.getAllByRole("listitem").filter((li) => li.className.includes("combo") && !li.className.includes("combos"))).toHaveLength(9);
    expect(screen.getByText("9 combinations, 9 in stock, from KES 1,000")).toBeInTheDocument();
  });

  it("marks a combination Not sold, updates the summary and leaves it out of the save", async () => {
    const { user, spy } = setup();
    await addAxis(user, "Size");
    await addValues(user, "Size", "S, M");
    await user.type(screen.getByLabelText("S price"), "900");
    await user.click(screen.getByRole("checkbox", { name: /Not sold: M/ }));
    expect(screen.getByText("1 combination, 1 in stock, from KES 900")).toBeInTheDocument();
    expect(optionsPayload(spy.current.options).variants).toHaveLength(1);
    await user.click(screen.getByRole("checkbox", { name: /Not sold: M/ }));
    expect(screen.getByText(/2 combinations/)).toBeInTheDocument();
  });

  it("lets one combination carry its own detail rows and saves them", async () => {
    const { user, spy } = setup();
    await addAxis(user, "Colour");
    await addValues(user, "Colour", "Black, Grey");
    const summary = screen.getAllByText(/^Details that differ/)[0];
    await user.click(summary);
    await user.click(screen.getByRole("button", { name: /^Add a detail for Black$/ }));
    await user.type(screen.getByLabelText("Detail name"), "Compatible devices");
    await user.type(screen.getByLabelText("Value for Black"), "Camera");
    expect(spy.current.options.rows[0].specs).toEqual([{ group: expect.any(String), label: "Compatible devices", value: "Camera" }]);
    expect(spy.current.options.rows[1].specs ?? []).toEqual([]);
    const payload = optionsPayload(spy.current.options);
    expect(payload.variants[0].specs).toHaveLength(1);
    expect(payload.variants[1].specs).toBeUndefined();
    await user.click(screen.getByRole("button", { name: "Remove detail Compatible devices for Black" }));
    expect(spy.current.options.rows[0].specs).toEqual([]);
  });

  it("refuses a duplicate value and says so", async () => {
    const { user } = setup();
    await addAxis(user, "Colour");
    await addValues(user, "Colour", "Red");
    await addValues(user, "Colour", "red");
    expect(screen.getByText("Red is already listed.")).toBeInTheDocument();
  });

  it("shows the value limit as a friendly counter and message, and the plan limit when the plan caps it", async () => {
    window.__plan = { values: 2 };
    const { user } = setup();
    await addAxis(user, "Size");
    await addValues(user, "Size", "S, M");
    expect(screen.getByText("2 of 2 values")).toBeInTheDocument();
    expect(screen.getByText("Your plan allows up to 2 values for one option. Upgrade to add more.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a value")).toBeDisabled();
  });

  it("stops at 3 option types", async () => {
    const { user } = setup();
    await addAxis(user, "Colour");
    await user.click(screen.getByRole("button", { name: "Add Size" }));
    await user.click(screen.getByRole("button", { name: "Add Storage" }));
    expect(screen.getByText("3 of 3 option types")).toBeInTheDocument();
    expect(screen.getByText("You can add up to 3 option types.")).toBeInTheDocument();
  });

  it("removing an option type asks twice", async () => {
    const { user, spy } = setup();
    await addAxis(user, "Colour");
    await user.click(screen.getByRole("button", { name: /^Remove Option type 1|^Remove/ }));
    expect(spy.current.options.axes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Yes, remove/ }));
    expect(spy.current.options.axes).toHaveLength(0);
  });

  it("has no accessibility violations with options and combinations on screen", async () => {
    const { user, container } = setup();
    await addAxis(user, "Colour");
    await addValues(user, "Colour", "Black, Grey");
    await addAxis(user, "Storage");
    await addValues(user, "Storage", "128 GB");
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("type axes, scales and price tools", () => {
  const phone = { id: "pt-phone", name: "Phone", axes: [{ key: "colour", label: "Colour", display: "swatch" }, { key: "storage", label: "Storage", display: "button", scale: "storage" }] };

  it("starts a typed item with the type's usual options in one tap", async () => {
    window.__types = [phone];
    const { user, spy } = setup({ productTypeId: "pt-phone" });
    await user.click(screen.getByRole("button", { name: /Use the usual options for Phone \(Colour, Storage\)/ }));
    expect(spy.current.options.axes.map((a) => a.label)).toEqual(["Colour", "Storage"]);
  });

  it("reads storage values the one shared way and explains one it cannot read", async () => {
    window.__types = [phone];
    const { user, spy } = setup({ productTypeId: "pt-phone" });
    await user.click(screen.getByRole("button", { name: /Use the usual options/ }));
    await addValues(user, "Storage", "128gb, 1024 GB, 64");
    expect(spy.current.options.axes[1].values.map((v) => v.label)).toEqual(["128 GB", "1 TB"]);
    expect(screen.getByText(/Add a unit to 64/)).toBeInTheDocument();
  });

  it("fills prices with base + difference, and warns about a typo without blocking", async () => {
    const { user, spy } = setup();
    await addAxis(user, "Storage");
    await addValues(user, "Storage", "128 GB, 256 GB, 512 GB");
    await addAxis(user, "Colour");
    await addValues(user, "Colour", "Black, Grey");
    await user.click(screen.getByText("Fill prices faster"));
    await user.selectOptions(screen.getByLabelText("How do you want to price?"), "diff");
    await user.type(screen.getByLabelText("128 GB (KES)"), "22000");
    await user.type(screen.getByLabelText("256 GB (KES)"), "25000");
    await user.type(screen.getByLabelText("512 GB (KES)"), "30000");
    await user.type(screen.getByLabelText("Grey (KES, such as -1000)"), "-1000");
    await user.click(screen.getByRole("button", { name: "Fill the prices" }));
    expect(screen.getByLabelText("256 GB / Grey price")).toHaveValue("24000");
    expect(screen.getByText("from KES 21,000", { exact: false })).toBeInTheDocument();
    const box = screen.getByLabelText("128 GB / Black price");
    await user.clear(box);
    await user.type(box, "2400");
    expect(screen.getByText(/far below the others/)).toBeInTheDocument();
    expect(spy.current.options.rows.length).toBe(6);
  });
});

describe("Dependent options (SanDisk)", () => {
  const build = async () => {
    const h = setup();
    const { user } = h;
    await addAxis(user, "Style");
    await addValues(user, "Style", "Old Version, New Version");
    await user.click(screen.getByRole("button", { name: "Add your own" }));
    await user.type(screen.getAllByLabelText("Name")[1], "Capacity");
    await addValues(user, "Capacity", "32 GB, 64 GB, 128 GB, 256 GB, 512 GB, 1 TB, 2 TB");
    await user.click(screen.getByRole("switch", { name: /This list changes with Style/ }));
    return h;
  };
  const chip = (set, name) => within(screen.getByRole("group", { name: new RegExp(`^${set} sells`) })).getByRole("button", { name });
  const untick = async (user, set, names) => { for (const n of names) await user.click(chip(set, n)); };

  it("shows one row of chips per parent value, toggles them, and copies one parent onto another", async () => {
    const { user, spy } = await build();
    expect(screen.getByRole("group", { name: "Old Version sells 7 values" })).toBeInTheDocument();
    await untick(user, "Old Version", ["64 GB", "2 TB"]);
    await untick(user, "New Version", ["32 GB"]);
    expect(screen.getByRole("group", { name: "Old Version sells 5 values" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "New Version sells 6 values" })).toBeInTheDocument();
    expect(chip("Old Version", "64 GB")).toHaveAttribute("aria-pressed", "false");
    expect(chip("New Version", "2 TB")).toHaveAttribute("aria-pressed", "true");
    expect(spy.current.options.rows.filter((r) => r.sold)).toHaveLength(11);
    await user.click(within(screen.getByRole("group", { name: /^Old Version sells/ })).getByRole("button", { name: /Copy values from New Version/ }));
    expect(screen.getByRole("group", { name: "Old Version sells 6 values" })).toBeInTheDocument();
    expect(chip("Old Version", "2 TB")).toHaveAttribute("aria-pressed", "true");
  });

  it("prices each combination, and a detail that differs for one parent lands only on its combinations", async () => {
    const { user, spy } = await build();
    await user.type(screen.getByLabelText("New Version / 256 GB price"), "12078");
    await user.type(screen.getByLabelText("New Version / 256 GB sale price"), "9000");
    await user.click(within(screen.getByRole("group", { name: /^New Version sells/ })).getByRole("button", { name: "Add a detail for New Version" }));
    await user.type(screen.getByLabelText("Detail name"), "Compatible devices");
    await user.type(screen.getByLabelText("Value for New Version"), "Camera");
    const payload = optionsPayload(spy.current.options);
    const nv = payload.variants.find((v) => v.choice.style === "new-version" && v.choice.capacity === "256-gb");
    expect(nv.price).toBe(12078);
    expect(nv.salePrice).toBe(9000);
    expect(nv.specs[0]).toMatchObject({ label: "Compatible devices", value: "Camera" });
    expect(payload.variants.filter((v) => v.choice.style === "old-version").every((v) => !v.specs)).toBe(true);
    expect(payload.axes[1].dependsOn).toBe("style");
  });

  it("switching the list off keeps the combinations", async () => {
    const { user, spy } = await build();
    await untick(user, "New Version", ["32 GB"]);
    await user.click(screen.getByRole("switch", { name: /This list changes with Style/ }));
    expect(spy.current.options.axes[1].dependsOn).toBeUndefined();
    expect(spy.current.options.rows.filter((r) => r.sold)).toHaveLength(13);
    expect(screen.queryByRole("group", { name: /Old Version sells/ })).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = await build();
    expect((await axe(container)).violations).toEqual([]);
  });
});

const named = async (n) => (await api.listItems()).find((i) => i.name === n);

describe("in the editor", () => {
  const openTyped = async () => {
    const { router } = await signedInApp("/business/catalog/new");
    router.navigate("/business/catalog/new", { state: { productTypeId: null } });
    await screen.findByLabelText("Name");
    return router;
  };

  it("saves options with the item, reloads them on edit, and an item with no options sends none", async () => {
    const user = userEvent.setup();
    const router = await openTyped();
    await user.type(screen.getByLabelText("Name"), "Tee shirt");
    await user.type(screen.getByLabelText("Price (KES)"), "1500");
    await user.click(within(document.getElementById("sec-options")).getByRole("button", { name: "Size" }));
    await addValues(user, "Size", "S, M");
    await user.type(screen.getByLabelText("S price"), "1400");
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(async () => expect(await named("Tee shirt")).toBeTruthy(), { timeout: 5000 });
    const item = await named("Tee shirt");
    const saved = await api.getItemOptions(item.id);
    expect(saved.axes[0]).toMatchObject({ key: "size", label: "Size" });
    expect(saved.variants.map((v) => [v.choice.size, v.price])).toEqual([["s", 1400], ["m", null]]);

    await router.navigate(`/business/catalog/${item.id}/edit`);
    expect(await screen.findByLabelText("S price")).toHaveValue("1400");
    expect(screen.getByText(/2 combinations/)).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).toBeNull();   // loading the options is not an edit
  });

  it("shows a missing option name where it is, and does not save", async () => {
    const user = userEvent.setup();
    await openTyped();
    await user.type(screen.getByLabelText("Name"), "Tee shirt");
    await user.type(screen.getByLabelText("Price (KES)"), "1500");
    await user.click(screen.getByRole("button", { name: "Your own" }));
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Name this option, for example Colour or Size.")).toBeInTheDocument();
    expect(await named("Tee shirt")).toBeUndefined();
  });

  it("an item with no type and no options shows no Options step and saves as before", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog/new");
    await user.type(await screen.findByLabelText("Name"), "Plain item");
    await user.type(screen.getByLabelText("Price (KES)"), "500");
    expect(screen.queryByRole("heading", { name: "Options" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(async () => expect(await named("Plain item")).toBeTruthy(), { timeout: 5000 });
    expect((await api.getItemOptions((await named("Plain item")).id)).axes).toEqual([]);
  });
});
