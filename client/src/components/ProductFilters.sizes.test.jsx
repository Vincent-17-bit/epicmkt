import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EMPTY_FILTERS } from "../lib/productFilters.js";
import { canonicalKey, sizeFacets } from "../lib/sizeFilters.js";
import { seriousViolations } from "../test/axe.js";
import ProductFilters from "./ProductFilters.jsx";

const shoe = (system, value) => ({ scale: "shoe", system, value });
const products = [
  { sizes: [shoe("eu", 42), shoe("eu", 43)] },
  { sizes: [shoe("uk", 8)] },
  { sizes: [{ scale: "apparel-numeric", system: "us", value: 42 }] },
  { sizes: [{ scale: "screen-inch", value: 42, unit: "in" }, { scale: "screen-inch", value: 55, unit: "in" }] },
  { sizes: [{ scale: "length", value: 5, unit: "m" }, { scale: "length", value: 10, unit: "m" }] },
  { sizes: [{ scale: "storage", value: 1024, unit: "GB" }, { scale: "storage", value: 128, unit: "GB" }] },
];
const facets = { categories: [], towns: [], brands: [], price: null, sizes: sizeFacets(products) };

const setup = (filters = {}) => {
  const onChange = vi.fn();
  const view = render(<ProductFilters filters={{ ...EMPTY_FILTERS, ...filters }} facets={facets} counts={null} categories={[]} categoryName={(id) => id} onChange={onChange} />);
  return { onChange, ...view };
};
const open = (title) => userEvent.click(screen.getByRole("button", { name: new RegExp(`^${title}`) }));

beforeEach(() => window.localStorage.clear());

describe("size sections in the product filters", () => {
  it("one section per scale, so shoe 42 and dress 42 are never in the same list", async () => {
    setup();
    for (const t of ["Dress size", "Shoe size", "Storage", "Screen size", "Length"]) expect(screen.getByRole("button", { name: new RegExp(`^${t}`) })).toBeInTheDocument();
    await open("Shoe size");
    await open("Dress size");
    const shoes = within(screen.getByRole("button", { name: /^Shoe size/ }).closest("section"));
    const dresses = within(screen.getByRole("button", { name: /^Dress size/ }).closest("section"));
    expect(shoes.getByRole("checkbox", { name: /EU 42/ })).toBeInTheDocument();
    expect(shoes.queryByRole("checkbox", { name: /US 42/ })).toBeNull();
    expect(dresses.getByRole("checkbox", { name: /US 42/ })).toBeInTheDocument();
  });

  it("ticking a size reports its canonical key", async () => {
    const { onChange } = setup();
    await open("Shoe size");
    await userEvent.click(screen.getByRole("checkbox", { name: /EU 42/ }));
    expect(onChange).toHaveBeenCalledWith({ sizes: [canonicalKey(shoe("eu", 42))] });
  });

  it("the shoe system switch relabels the same sizes and is remembered", async () => {
    setup();
    await open("Shoe size");
    expect(screen.getByRole("checkbox", { name: /EU 42/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "UK" }));
    expect(screen.getByRole("checkbox", { name: /UK 8/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /EU 42/ })).toBeNull();
    expect(window.localStorage.getItem("epicmkt.shoeSystem")).toBe("uk");
  });

  it("storage lists in size order with 1024 GB as 1 TB", async () => {
    setup();
    await open("Storage");
    const labels = within(screen.getByRole("button", { name: /^Storage/ }).closest("section")).getAllByRole("checkbox").map((c) => c.closest("label").textContent);
    expect(labels[0]).toMatch(/128 GB/);
    expect(labels[1]).toMatch(/1 TB/);
  });

  it("a range reports its ends in the display unit and clears when emptied", async () => {
    const { onChange } = setup({ ranges: { length: { min: "5", max: "" } } });
    const min = screen.getByRole("textbox", { name: /Minimum length in metres/i });
    expect(min).toHaveValue("5");
    await userEvent.type(screen.getByRole("textbox", { name: /Maximum length in metres/i }), "1");
    expect(onChange).toHaveBeenLastCalledWith({ ranges: { length: { min: "5", max: "1" } } });
    await userEvent.clear(min);
    expect(onChange).toHaveBeenLastCalledWith({ ranges: {} });
  });

  it("ranges show the real bounds as placeholders", async () => {
    setup();
    await open("Screen size");
    expect(screen.getByRole("textbox", { name: /Minimum screen size in inches/i })).toHaveAttribute("placeholder", "42");
    expect(screen.getByRole("textbox", { name: /Maximum screen size in inches/i })).toHaveAttribute("placeholder", "55");
  });

  it("shows no size sections when no product has sizes", () => {
    render(<ProductFilters filters={EMPTY_FILTERS} facets={{ categories: [], towns: [], brands: [], price: null, sizes: [] }} counts={null} categories={[]} categoryName={(id) => id} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Shoe size/ })).toBeNull();
  });

  it("has no serious accessibility violations with every section open", async () => {
    const { container } = setup({ sizes: [canonicalKey(shoe("eu", 42))], ranges: { length: { min: "5", max: "" } } });
    for (const t of ["Dress size", "Storage", "Screen size"]) await open(t);
    expect(await seriousViolations(container)).toEqual([]);
  });
});
