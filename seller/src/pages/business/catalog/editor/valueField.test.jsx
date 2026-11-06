// A18: the brand field suggests values from the shared dictionary, adds a typed one, and the save links the item to its value.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../../../api/index.js";
import { M, signedInApp } from "../../../../test/utils.jsx";

const realMatchMedia = window.matchMedia;
const wide = () => {
  window.matchMedia = (q) => {
    const m = /\((min|max)-width:\s*([\d.]+)rem\)/.exec(q);
    const edge = m ? Number(m[2]) * 16 : 0;
    const matches = m ? (m[1] === "min" ? 1000 >= edge : 1000 <= edge) : false;
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
};
beforeEach(wide);
afterEach(() => { window.matchMedia = realMatchMedia; });

const openNew = async () => {
  const app = await signedInApp("/business/catalog/new");
  await screen.findByRole("heading", { level: 1, name: "Add item" });
  return app;
};
const brandBox = () => screen.getByRole("combobox", { name: /Brand/ });
const seed = async (...labels) => { for (const l of labels) await api.addOptionValue("brand", l); };
const fillAndSave = async (user, brand) => {
  await user.type(screen.getByLabelText("Name"), "Phone");
  await user.type(screen.getByLabelText("Price (KES)"), "9000");
  if (brand) await user.type(brandBox(), brand);
  await user.click(screen.getByRole("button", { name: "Save as draft" }));
};

describe("brand type-ahead", () => {
  it("is a labelled combobox that opens a list of suggestions as the seller types", async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung", "Sony", "Nike");
    const box = brandBox();
    expect(box).toHaveAttribute("aria-expanded", "false");
    await user.type(box, "S");
    const list = await screen.findByRole("listbox", { name: /Brand.*suggestions/ });
    expect(box).toHaveAttribute("aria-expanded", "true");
    expect(box).toHaveAttribute("aria-controls", list.id);
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(expect.arrayContaining(["Samsung new", "Sony new", "Add “S”"]));
    expect(within(list).queryByText("Nike")).toBeNull();
  });

  it("picks with the keyboard (arrows and Enter), reports the choice, and closes", async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung");
    const box = brandBox();
    await user.type(box, "sams");
    await screen.findByRole("option", { name: /Samsung/ });
    await user.keyboard("{ArrowDown}");
    expect(box.getAttribute("aria-activedescendant")).toBeTruthy();
    expect(document.getElementById(box.getAttribute("aria-activedescendant"))).toHaveTextContent("Samsung");
    await user.keyboard("{Enter}");
    expect(box).toHaveValue("Samsung");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByTestId("brand-pending")).toHaveTextContent(/will review it/);
    expect(box).toHaveAttribute("data-value-id");
  });

  it("Escape closes the list without changing what was typed", async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung");
    await user.type(brandBox(), "sams");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(brandBox()).toHaveValue("sams");
  });

  it('offers Add "<typed>", adds it at once as a new value, and shows it exactly as typed', async () => {
    const user = userEvent.setup();
    await openNew();
    await user.type(brandBox(), "Brookside");
    await user.click(await screen.findByRole("option", { name: "Add “Brookside”" }));
    expect(brandBox()).toHaveValue("Brookside");
    await waitFor(() => expect(M.state.values.map((v) => [v.label, v.status])).toEqual([["Brookside", "pending"]]));
    expect(await screen.findByTestId("brand-pending")).toBeInTheDocument();
    expect(brandBox()).toHaveValue("Brookside");
  });

  it("does not offer Add for a spelling that already exists, however it is cased", async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung");
    await user.type(brandBox(), "SAMSUNG");
    await screen.findByRole("option", { name: /Samsung/ });
    expect(screen.queryByRole("option", { name: /Add/ })).toBeNull();
  });

  it("typing again after a pick forgets the pick", async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung");
    await user.type(brandBox(), "sams");
    await user.click(await screen.findByRole("option", { name: /Samsung/ }));
    expect(brandBox()).toHaveAttribute("data-value-id");
    await user.type(brandBox(), "x");
    expect(brandBox()).not.toHaveAttribute("data-value-id");
    expect(screen.queryByTestId("brand-pending")).toBeNull();
  });

  it("still lets the seller type freely when suggestions cannot load", async () => {
    const user = userEvent.setup();
    await openNew();
    const keep = M.state.values;
    Object.defineProperty(M.state, "values", { configurable: true, get() { throw new Error("down"); } });
    try {
      await user.type(brandBox(), "Zed");
      expect(brandBox()).toHaveValue("Zed");
      await new Promise((r) => setTimeout(r, 400));   // the lookup has failed by now
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(brandBox()).toHaveValue("Zed");
    } finally {
      Object.defineProperty(M.state, "values", { configurable: true, writable: true, value: keep });
    }
  });
});

describe("saving links the item to its dictionary value", () => {
  it("a picked brand is linked to its value", async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung");
    await user.type(brandBox(), "sams");
    await user.click(await screen.findByRole("option", { name: /Samsung/ }));
    await user.click(screen.getByLabelText("Name"));
    await fillAndSave(user, null);
    await waitFor(async () => {
      const saved = (await api.getCatalog()).items.find((i) => i.name === "Phone");
      expect(saved.brand).toBe("Samsung");
      expect(M.state.valueLinks.get(saved.id)).toEqual([{ slot: "brand", valueId: M.state.values[0].id }]);
    });
  });

  it('a brand that was only typed becomes one value: "SAMSUNG" saves as the existing "Samsung"', async () => {
    const user = userEvent.setup();
    await openNew();
    await seed("Samsung");
    await fillAndSave(user, "SAMSUNG");
    await waitFor(async () => {
      const saved = (await api.getCatalog()).items.find((i) => i.name === "Phone");
      expect(saved.brand).toBe("Samsung");
      expect(M.state.values).toHaveLength(1);
      expect(M.state.valueLinks.get(saved.id)).toHaveLength(1);
    });
  });

  it("a brand nobody has typed yet is added as a new value and linked", async () => {
    const user = userEvent.setup();
    await openNew();
    await fillAndSave(user, "Tecno");
    await waitFor(async () => {
      const saved = (await api.getCatalog()).items.find((i) => i.name === "Phone");
      expect(saved.brand).toBe("Tecno");
      expect(M.state.values.map((v) => [v.label, v.status])).toEqual([["Tecno", "pending"]]);
      expect(M.state.valueLinks.get(saved.id)).toEqual([{ slot: "brand", valueId: M.state.values[0].id }]);
    });
  });

  it("an item with no brand is saved as before, with no value and no link", async () => {
    const user = userEvent.setup();
    await openNew();
    await fillAndSave(user, null);
    await waitFor(async () => {
      const saved = (await api.getCatalog()).items.find((i) => i.name === "Phone");
      expect(saved).toBeTruthy();
      expect(M.state.values).toHaveLength(0);
      expect(M.state.valueLinks.size).toBe(0);
    });
  });

  it("the save still works when the dictionary calls fail", async () => {
    const user = userEvent.setup();
    await openNew();
    const keep = M.state.values;
    Object.defineProperty(M.state, "values", { configurable: true, get() { throw new Error("down"); } });
    try {
      await fillAndSave(user, "Tecno");
      await waitFor(async () => expect((await api.getCatalog()).items.find((i) => i.name === "Phone")?.brand).toBe("Tecno"));
    } finally {
      Object.defineProperty(M.state, "values", { configurable: true, writable: true, value: keep });
    }
  });
});
