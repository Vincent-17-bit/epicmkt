import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as scales from "../../../shared/src/scales/index.js";
import { EMPTY_FILTERS, facetsOf } from "../lib/productFilters.js";
import { seriousViolations } from "../test/axe.js";
import ProductFilters from "./ProductFilters.jsx";

const v = (scale, raw) => scales.parse(scale, raw).value;
const products = [
  { id: "1", name: "Loafers", pricing: { salePrice: 1 }, business: {}, sizeValues: [v("shoe", "EU 41"), v("shoe", "EU 42")] },
  { id: "2", name: "TV", pricing: { salePrice: 1 }, business: {}, sizeValues: [v("screen-inch", "42 inch"), v("storage", "1024 GB"), v("storage", "512 GB")] },
  { id: "3", name: "Strip", pricing: { salePrice: 1 }, business: {}, sizeValues: [v("length", "5 m"), v("length", "10 m")] },
  { id: "4", name: "Dress", pricing: { salePrice: 1 }, business: {}, sizeValues: [{ scale: "apparel-numeric", system: "eu", value: 42 }] }
];

function Harness({ list = products, onChange = () => {} }) {
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [system, setSystem] = useState("eu");
  const facets = facetsOf(list);
  return (
    <>
      <ProductFilters filters={filters} facets={facets} categories={[]} categoryName={(x) => x} shoeSystem={system} onShoeSystem={setSystem} onChange={(patch) => { onChange(patch); setFilters((f) => ({ ...f, ...patch })); }} />
      <output data-testid="state">{JSON.stringify({ sizes: filters.sizes, ranges: filters.ranges })}</output>
    </>
  );
}
const open = async () => userEvent.click(screen.getByRole("button", { name: /^Size/ }));

describe("size section of the product filters", () => {
  it("is absent when no product has sizes", () => {
    render(<Harness list={[{ id: "1", name: "Bread", pricing: { salePrice: 1 }, business: {} }]} />);
    expect(screen.queryByRole("button", { name: /^Size/ })).toBeNull();
  });

  it("keeps shoe 42 and dress 42 in separate groups", async () => {
    render(<Harness />);
    await open();
    const shoe = screen.getByRole("group", { name: "Shoe size" });
    const clothing = screen.getByRole("group", { name: "Clothing size (numbers)" });
    expect(within(shoe).getByRole("checkbox", { name: /EU 42/ })).toBeInTheDocument();
    expect(within(clothing).getByRole("checkbox", { name: /42/ })).toBeInTheDocument();
    await userEvent.click(within(shoe).getByRole("checkbox", { name: /EU 42/ }));
    expect(JSON.parse(screen.getByTestId("state").textContent).sizes).toEqual(["shoe:eu:42"]);
  });

  it("the shoe system switch rewrites the labels and keeps the choice", async () => {
    render(<Harness />);
    await open();
    const shoe = screen.getByRole("group", { name: "Shoe size" });
    await userEvent.click(within(shoe).getByRole("checkbox", { name: /EU 42/ }));
    await userEvent.click(within(shoe).getByRole("radio", { name: "UK" }));
    expect(within(shoe).getByRole("checkbox", { name: /UK 8/ })).toBeChecked();
    expect(JSON.parse(screen.getByTestId("state").textContent).sizes).toEqual(["shoe:eu:42"]);
  });

  it("lists storage smallest to largest", async () => {
    render(<Harness />);
    await open();
    const storage = screen.getByRole("group", { name: "Storage" });
    const labels = within(storage).getAllByRole("checkbox").map((c) => c.closest("label").textContent);
    expect(labels[0]).toMatch(/512 GB/);
    expect(labels[1]).toMatch(/1 TB/);
  });

  it("takes a length range in metres", async () => {
    render(<Harness />);
    await open();
    await userEvent.type(screen.getByRole("textbox", { name: "Minimum length in metres" }), "5");
    await userEvent.type(screen.getByRole("textbox", { name: "Maximum length in metres" }), "10");
    expect(JSON.parse(screen.getByTestId("state").textContent).ranges).toEqual({ length: { min: "5", max: "10" } });
    await userEvent.clear(screen.getByRole("textbox", { name: "Minimum length in metres" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Maximum length in metres" }));
    expect(JSON.parse(screen.getByTestId("state").textContent).ranges).toEqual({});
  });

  it("has no serious accessibility violations", async () => {
    const { container } = render(<Harness />);
    await open();
    expect(await seriousViolations(container)).toEqual([]);
  });
});
