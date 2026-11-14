import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { signedInApp } from "../../../test/utils.jsx";
import TypePicker from "./editor/steps/TypePicker.jsx";
import { PRODUCT_TYPES, fixtureProductTypes } from "./AddItem.fixtures.js";
import { canSell, groupByDepartment, recentTypeIds, searchTypes, sellableTypes, suggestedTypes } from "./AddItem.data.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const noSeriousViolations = async (node) => {
  const results = await axe(node);
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
};

// The shops from the acceptance list, by live category id.
const BOUTIQUE = "tailor-boutique";
const ELECTRONICS = "electronics-appliances";
const CHEMIST = "chemist";
const AGROVET = "agrovet";
const BARBER = "barber";

const show = (categoryId, props = {}) => {
  const data = fixtureProductTypes({ categoryId });
  const onPick = vi.fn();
  const onOther = vi.fn();
  const onRequestType = vi.fn(async () => ({ ok: true }));
  const view = render(<TypePicker types={data.types} departments={data.departments} categoryId={categoryId} onPick={onPick} onOther={onOther} onRequestType={onRequestType} {...props} />);
  return { ...view, onPick, onOther, onRequestType, user: userEvent.setup() };
};
const search = (u) => u.type(screen.getByRole("searchbox", { name: "Search for what you sell" }), "");
const typeInto = async (u, text) => { await u.click(screen.getByRole("searchbox")); await u.keyboard(text); };

const realMatchMedia = window.matchMedia;
const viewport = (px) => {
  window.matchMedia = (q) => {
    const m = /\((min|max)-width:\s*([\d.]+)rem\)/.exec(q);
    const edge = m ? Number(m[2]) * 16 : 0;
    const matches = m ? (m[1] === "min" ? px >= edge : px <= edge) : false;
    return { matches, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  };
};
afterEach(() => { window.matchMedia = realMatchMedia; });

describe("selling rules", () => {
  const names = (categoryId) => sellableTypes(PRODUCT_TYPES, categoryId).map((t) => t.name);
  it("lets only a chemist sell prescription medicine and only an agrovet sell veterinary medicine", () => {
    expect(names(CHEMIST)).toContain("Prescription medicine");
    for (const other of [BOUTIQUE, ELECTRONICS, AGROVET, BARBER]) expect(names(other)).not.toContain("Prescription medicine");
    expect(names(AGROVET)).toContain("Veterinary medicine");
    for (const other of [BOUTIQUE, ELECTRONICS, CHEMIST, BARBER]) expect(names(other)).not.toContain("Veterinary medicine");
  });
  it("never locks a type to the shop's category", () => {
    expect(names(BOUTIQUE)).toContain("Perfume");
    expect(names(ELECTRONICS)).toContain("A4 paper");
    expect(names(ELECTRONICS)).toContain("Perfume");
    expect(canSell(PRODUCT_TYPES.find((t) => t.slug === "pens"), CHEMIST)).toBe(true);
  });
  it("matches typed words to the start of a word in the name or the department", () => {
    const { types, departments } = fixtureProductTypes({ categoryId: ELECTRONICS });
    const find = (q) => searchTypes(types, departments, q).map((t) => t.name);
    expect(find("bulb")).toEqual(["LED bulb"]);
    expect(find("a4 pap")).toEqual(["A4 paper"]);
    expect(find("a4")).toEqual(expect.arrayContaining(["A4 paper", "A4 printing"]));
    expect(find("stationery")).toEqual(expect.arrayContaining(["A4 paper", "Pens"]));
    expect(find("zzz")).toEqual([]);
    expect(find("   ")).toEqual([]);
  });
  it("suggests recent types first, then the shop's category, and drops the rest", () => {
    const { types } = fixtureProductTypes({ categoryId: ELECTRONICS });
    const names = suggestedTypes(types, { categoryId: ELECTRONICS, recentIds: ["pt-pens", "pt-nope"] }).map((t) => t.name);
    expect(names[0]).toBe("Pens");
    expect(names).toEqual(expect.arrayContaining(["Phone", "Phone charger", "LED bulb"]));
    expect(names).not.toContain("Perfume");
  });
  it("reads recent types from the shop's newest items", () => {
    expect(recentTypeIds([{ productTypeId: "a", updatedAt: "2026-01-01" }, { productTypeId: "b", updatedAt: "2026-03-01" }, { updatedAt: "2026-04-01" }, { productTypeId: "a", updatedAt: "2026-02-01" }])).toEqual(["b", "a"]);
  });
  it("groups by department in department order and keeps types with an unknown department", () => {
    const { types, departments } = fixtureProductTypes({ categoryId: ELECTRONICS });
    const groups = groupByDepartment([...types, { id: "x", name: "Odd", departmentId: "dep-unknown" }], departments);
    expect(groups.at(-1)).toMatchObject({ name: "More types" });
    expect(groups.map((g) => g.name).indexOf("Phones")).toBeLessThan(groups.map((g) => g.name).indexOf("Stationery"));
  });
});

describe("picker", () => {
  it("shows suggestions and every department when the search is empty", () => {
    show(BOUTIQUE);
    const usual = screen.getByRole("region", { name: "Your shop usually sells" });
    expect(within(usual).getByRole("button", { name: "Perfume" })).toBeInTheDocument();
    expect(within(usual).getByRole("button", { name: "Dress" })).toBeInTheDocument();
    expect(within(usual).queryByRole("button", { name: "Pens" })).not.toBeInTheDocument();
    const all = screen.getByRole("region", { name: "All departments" });
    for (const d of ["Clothing", "Fragrance", "Phones", "Cables and power", "Stationery", "Printing services"]) expect(within(all).getByRole("button", { name: new RegExp(d) })).toBeInTheDocument();
  });

  it("lets a boutique pick fragrance", async () => {
    const { user, onPick } = show(BOUTIQUE);
    await user.click(within(screen.getByRole("region", { name: "Your shop usually sells" })).getByRole("button", { name: "Perfume" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "pt-perfume", name: "Perfume" }));
  });

  it("lets an electronics shop pick stationery by searching, and from the department list", async () => {
    const first = show(ELECTRONICS);
    await typeInto(first.user, "A4 paper");
    expect(await screen.findByRole("status")).toHaveTextContent("1 type found");
    await first.user.click(within(screen.getByRole("list", { name: "Search results" })).getByRole("button", { name: /A4 paper/ }));
    expect(first.onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "pt-a4-paper" }));
    first.unmount();

    const second = show(ELECTRONICS);
    const toggle = screen.getByRole("button", { name: /Stationery/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await second.user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await second.user.click(within(screen.getByRole("list", { name: "Stationery" })).getByRole("button", { name: /Pens/ }));
    expect(second.onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "pt-pens" }));
  });

  it("shows prescription medicine to a chemist and to nobody else", async () => {
    const chemist = show(CHEMIST);
    await typeInto(chemist.user, "prescription");
    expect(await screen.findByRole("button", { name: /Prescription medicine/ })).toBeInTheDocument();
    chemist.unmount();
    for (const other of [BOUTIQUE, ELECTRONICS, AGROVET, BARBER]) {
      const view = show(other);
      await typeInto(view.user, "prescription");
      expect(await screen.findByRole("status")).toHaveTextContent("No type matches");
      expect(screen.queryByRole("button", { name: /Prescription/ })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("hides a restricted type even if a stale list still holds it", () => {
    const stale = sellableTypes(PRODUCT_TYPES, BOUTIQUE);
    const { departments } = fixtureProductTypes({ categoryId: BOUTIQUE });
    render(<TypePicker types={stale} departments={departments} categoryId={BOUTIQUE} onPick={() => {}} />);
    expect(screen.queryByText(/Prescription/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Veterinary/)).not.toBeInTheDocument();
  });

  it("puts the shop's recent types first in the chips", () => {
    show(ELECTRONICS, { recentIds: ["pt-pens"] });
    const chips = within(screen.getByRole("region", { name: "Your shop usually sells" })).getAllByRole("button");
    expect(chips[0]).toHaveAccessibleName("Pens");
  });

  it("works from the keyboard alone", async () => {
    const { user, onPick } = show(ELECTRONICS, { autoFocus: true });
    const box = screen.getByRole("searchbox");
    expect(box).toHaveFocus();
    await user.keyboard("a4");
    await user.keyboard("{ArrowDown}");
    const options = within(screen.getByRole("list", { name: "Search results" })).getAllByRole("button");
    expect(options[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(box).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(box).toHaveValue("");
    await user.keyboard("pens{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "pt-pens" }));
  });

  it("opens a department with Enter and reaches its types with Tab", async () => {
    const { user, onPick } = show(ELECTRONICS);
    screen.getByRole("button", { name: /Stationery/ }).focus();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.getByRole("button", { name: /A4 paper/ })).toHaveFocus();
    await user.keyboard(" ");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "pt-a4-paper" }));
  });

  it("marks the current type", () => {
    show(BOUTIQUE, { currentId: "pt-dress" });
    expect(screen.getByRole("button", { name: "Dress" })).toHaveAttribute("aria-current", "true");
  });

  describe("Can't find it?", () => {
    it("sends the request, then goes on as Other goods", async () => {
      const { user, onRequestType, onOther } = show(BOUTIQUE);
      await typeInto(user, "hair dryer");
      await user.click(screen.getByRole("button", { name: /Can.t find it/ }));
      const name = screen.getByLabelText("What do you sell?");
      expect(name).toHaveValue("hair dryer");
      expect(name).toHaveFocus();
      await user.type(screen.getByLabelText(/Anything else/), "for salons");
      await user.click(screen.getByRole("button", { name: "Send and add as Other goods" }));
      await waitFor(() => expect(onOther).toHaveBeenCalledWith({ name: "hair dryer", note: "for salons", requested: true }));
      expect(onRequestType).toHaveBeenCalledWith({ name: "hair dryer", note: "for salons" });
    });

    it("asks for a name before sending", async () => {
      const { user, onRequestType } = show(BOUTIQUE);
      await user.click(screen.getByRole("button", { name: /Can.t find it/ }));
      await user.click(screen.getByRole("button", { name: "Send and add as Other goods" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Tell us in a few words");
      expect(screen.getByLabelText("What do you sell?")).toHaveAttribute("aria-invalid", "true");
      expect(onRequestType).not.toHaveBeenCalled();
    });

    it("still lets the seller add the item as Other goods when sending fails or is skipped", async () => {
      const failing = vi.fn(async () => { throw new Error("offline"); });
      const { user, onOther } = show(BOUTIQUE, { onRequestType: failing });
      await user.click(screen.getByRole("button", { name: /Can.t find it/ }));
      await user.type(screen.getByLabelText("What do you sell?"), "wigs");
      await user.click(screen.getByRole("button", { name: "Send and add as Other goods" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("You can still add your item as Other goods");
      expect(onOther).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Add as Other goods without sending" }));
      expect(onOther).toHaveBeenCalledWith({ name: "wigs", note: "", requested: false });
    });
  });

  describe("accessibility (axe)", () => {
    it("has no serious violations when empty, searching, with no match, and with the request form open", async () => {
      const { container, user } = show(BOUTIQUE);
      await noSeriousViolations(container);
      await user.click(screen.getByRole("button", { name: /Stationery/ }));
      await noSeriousViolations(container);
      await typeInto(user, "perf");
      await noSeriousViolations(container);
      await user.clear(screen.getByRole("searchbox"));
      await user.type(screen.getByRole("searchbox"), "qqq");
      await noSeriousViolations(container);
      await user.click(screen.getByRole("button", { name: /Can.t find it/ }));
      await noSeriousViolations(container);
    });
  });
});

describe("Add item page and Type step", () => {
  it("opens the picker, then the editor with the chosen type", async () => {
    viewport(1000);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/add");
    await screen.findByRole("heading", { level: 1, name: "What are you adding?" });
    await screen.findByRole("searchbox", { name: "Search for what you sell" });
    await user.click(await screen.findByRole("button", { name: /Phones/ }));
    await user.click(within(screen.getByRole("list", { name: "Phones" })).getByRole("button", { name: /^Phone/ }));
    await screen.findByRole("heading", { level: 1, name: "Add item" });
    expect(router.state.location.pathname).toBe("/business/catalog/new");
    expect(router.state.location.state.productTypeId).toBe("phone");
    const step = document.getElementById("sec-type");
    expect(step).not.toBeNull();
    expect(within(step).getByText("Phone")).toBeInTheDocument();
  });

  it("goes on as Other goods with no type, and the editor shows Other goods", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add");
    await user.click(await screen.findByRole("button", { name: /Can.t find it/ }));
    await user.type(screen.getByLabelText("What do you sell?"), "Hair dryer");
    await user.click(screen.getByRole("button", { name: "Add as Other goods without sending" }));
    await screen.findByRole("heading", { level: 1, name: "Add item" });
    expect(within(document.getElementById("sec-type")).getByText("Other goods")).toBeInTheDocument();
  });

  it("warns before changing the type and only changes it on confirm", async () => {
    viewport(1000);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/add");
    await user.click(await screen.findByRole("button", { name: /Phones/ }));
    await user.click(within(screen.getByRole("list", { name: "Phones" })).getByRole("button", { name: /^Phone/ }));
    const step = () => document.getElementById("sec-type");
    await waitFor(() => expect(step()).not.toBeNull());
    await user.click(await within(step()).findByRole("button", { name: "Change type" }));
    const picker = await screen.findByRole("dialog", { name: "Change the type" });
    await user.click(within(picker).getByRole("button", { name: /Shoes/ }));
    await user.click(within(within(picker).getByRole("list", { name: "Shoes" })).getByRole("button"));
    const ask = await screen.findByRole("dialog", { name: "Change the type?" });
    expect(ask).toHaveTextContent("will reset");
    await user.click(within(ask).getByRole("button", { name: "Keep Phone" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Change the type" })).not.toBeInTheDocument());
    expect(within(step()).getByText("Phone")).toBeInTheDocument();
    await user.click(within(step()).getByRole("button", { name: "Change type" }));
    const again = await screen.findByRole("dialog", { name: "Change the type" });
    await user.click(within(again).getByRole("button", { name: /Shoes/ }));
    await user.click(within(within(again).getByRole("list", { name: "Shoes" })).getByRole("button"));
    await user.click(within(await screen.findByRole("dialog", { name: "Change the type?" })).getByRole("button", { name: "Change to Shoes (EU sizes)" }));
    await waitFor(() => expect(within(step()).getByText("Shoes (EU sizes)")).toBeInTheDocument());
  });

  it("leaves an item with no type exactly as before: no Type step", async () => {
    viewport(1000);
    await signedInApp("/business/catalog/new");
    await screen.findByRole("heading", { level: 1, name: "Add item" });
    expect(document.getElementById("sec-type")).toBeNull();
  });

  it("has no serious violations on the Add item page", async () => {
    viewport(1000);
    const { container } = await signedInApp("/business/catalog/add");
    await screen.findByRole("searchbox", { name: "Search for what you sell" });
    await noSeriousViolations(container);
  });
});
