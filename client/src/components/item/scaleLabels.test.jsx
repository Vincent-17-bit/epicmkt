import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { seriousViolations } from "../../test/axe.js";
import { SHOE_SYSTEM_KEY } from "../../lib/shoeSystem.js";
import { dimensionsText, labelFor, scaleIdFor, storedOf } from "../../lib/scaleLabels.js";
import Options from "./Options.jsx";

const variant = (id, choice, extra = {}) => ({ id, label: Object.values(choice).join(" / "), choice, price: 1000, salePrice: null, status: "available", sku: null, mediaIds: [], stockLeft: null, ...extra });
const item = (over) => ({ id: "it", productType: null, sizeChart: null, defaultVariantId: null, ...over });

const shoes = () =>
  item({
    productType: "shoes-eu",
    sizeChart: { id: "c", name: "Women's shoes", unit: "cm", overridden: false, columns: ["EU", "Foot length"], rows: [["41", "26.1"], ["42", "26.7"]] },
    options: [{ key: "size", label: "Size", display: "button", values: [{ id: "eu-41", label: "EU 41" }, { id: "eu-42", label: "EU 42" }] }],
    optionVariants: [variant("a", { size: "eu-41" }), variant("b", { size: "eu-42" })],
    defaultVariantId: "b"
  });

function Harness({ item: it }) {
  const option = useOptionSelection(it, "it");
  return (
    <>
      <Options ctx={{ option }} slot={{ item: it }} />
      <output data-testid="variant">{option?.variant?.id ?? "none"}</output>
    </>
  );
}
const mount = (it) => render(<MemoryRouter initialEntries={["/?item=it"]}><Harness item={it} /></MemoryRouter>);
const checkedOf = (name) => within(screen.getByRole("radiogroup", { name: new RegExp(`^${name}:`) })).getByRole("radio", { checked: true });

beforeEach(() => localStorage.clear());

describe("scale-aware option labels", () => {
  it("shows a shoe in every system with the length in cm", () => {
    mount(shoes());
    expect(checkedOf("Size")).toHaveAccessibleName(/EU 42 · UK 8 · US 9 \(about 27 cm\)/);
  });

  it("switching the shoe system rewrites the label and keeps the same size selected", async () => {
    mount(shoes());
    expect(screen.getByTestId("variant")).toHaveTextContent("b");
    await userEvent.click(screen.getByRole("radio", { name: "UK" }));
    expect(screen.getByRole("radio", { name: "UK" })).toBeChecked();
    expect(checkedOf("Size")).toHaveAccessibleName(/^UK 8 · EU 42 · US 9/);
    expect(screen.getByTestId("variant")).toHaveTextContent("b"); // still EU 42
    await userEvent.click(screen.getByRole("radio", { name: "US women" }));
    expect(checkedOf("Size")).toHaveAccessibleName(/^US 10 · EU 42 · UK 8/);
    expect(screen.getByTestId("variant")).toHaveTextContent("b");
  });

  it("remembers the buyer's system on this device, and the buyer's choice wins over the item's default", async () => {
    const first = mount(shoes());
    await userEvent.click(screen.getByRole("radio", { name: "UK" }));
    expect(localStorage.getItem(SHOE_SYSTEM_KEY)).toBe("uk");
    first.unmount();
    mount(shoes());
    expect(screen.getByRole("radio", { name: "UK" })).toBeChecked();
    expect(checkedOf("Size")).toHaveAccessibleName(/^UK 8/);
  });

  it("uses the item's own system as the default when the buyer has none (UK-written sizes start in UK)", () => {
    const it = shoes();
    it.options[0].values = [{ id: "uk-8", label: "UK 8" }, { id: "uk-9", label: "UK 9" }];
    it.optionVariants = [variant("a", { size: "uk-8" }), variant("b", { size: "uk-9" })];
    it.defaultVariantId = "a";
    mount(it);
    expect(screen.getByRole("radio", { name: "UK" })).toBeChecked();
    expect(checkedOf("Size")).toHaveAccessibleName(/^UK 8 · EU 42/);
  });

  it("arrow keys move the system switch", async () => {
    mount(shoes());
    screen.getByRole("radio", { name: "EU" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "UK" })).toBeChecked();
  });

  it("shows 1024 GB as 1 TB", () => {
    const it = item({
      productType: "phone",
      options: [{ key: "storage", label: "Storage", display: "button", values: [{ id: "a", label: "512 GB" }, { id: "b", label: "1024 GB" }] }],
      optionVariants: [variant("a", { storage: "a" }), variant("b", { storage: "b" })],
      defaultVariantId: "b"
    });
    mount(it);
    expect(checkedOf("Storage")).toHaveAccessibleName(/1 TB/);
    expect(screen.getByRole("radio", { name: /512 GB/ })).toBeInTheDocument();
  });

  it("shows a collar as 16 in when the axis names its scale", () => {
    const it = item({
      options: [{ key: "collar", label: "Collar", scale: "collar-inch", display: "button", values: [{ id: "a", label: "15.5" }, { id: "b", label: "16" }] }],
      optionVariants: [variant("a", { collar: "a" }), variant("b", { collar: "b" })],
      defaultVariantId: "b"
    });
    mount(it);
    expect(checkedOf("Collar")).toHaveAccessibleName(/16 in/);
    expect(screen.getByRole("radio", { name: /15\.5 in/ })).toBeInTheDocument();
  });

  it("shows seats as 3-seater and the sofa's size follows the seats option", async () => {
    const it = item({
      productType: "sofa",
      options: [{ key: "seats", label: "Seats", display: "button", values: [{ id: "s2", label: "2 seater" }, { id: "s3", label: "3 seater" }] }],
      optionVariants: [
        variant("a", { seats: "s2" }, { dimensions: { length: 160, width: 88, height: 85, unit: "cm" } }),
        variant("b", { seats: "s3" }, { dimensions: { length: 210, width: 90, height: 88, unit: "cm" } })
      ],
      defaultVariantId: "a"
    });
    mount(it);
    expect(screen.getByRole("radio", { name: /3-seater/ })).toBeInTheDocument();
    expect(screen.getByTestId("variant-dimensions")).toHaveTextContent("160 × 88 × 85 cm");
    await userEvent.click(screen.getByRole("radio", { name: /3-seater/ }));
    expect(screen.getByTestId("variant-dimensions")).toHaveTextContent("210 × 90 × 88 cm");
  });

  it("leaves an item with no product type exactly as the seller wrote it (no switch, no rewriting)", () => {
    const it = item({
      options: [{ key: "size", label: "Size", display: "button", values: [{ id: "a", label: "EU 42" }, { id: "b", label: "1024 GB" }] }],
      optionVariants: [variant("a", { size: "a" }), variant("b", { size: "b" })],
      defaultVariantId: "a"
    });
    mount(it);
    expect(screen.queryByRole("radiogroup", { name: "Shoe size system" })).toBeNull();
    expect(checkedOf("Size")).toHaveAccessibleName(/^EU 42$/);
  });

  it("keeps a label it cannot read exactly as written", () => {
    const it = shoes();
    it.options[0].values = [{ id: "m", label: "Mystery size" }, { id: "eu-42", label: "EU 42" }];
    it.optionVariants = [variant("a", { size: "m" }), variant("b", { size: "eu-42" })];
    it.defaultVariantId = "a";
    mount(it);
    expect(checkedOf("Size")).toHaveAccessibleName(/^Mystery size$/);
  });

  it("puts the size chart link beside the size axis and shows the shoe conversion table in it", async () => {
    mount(shoes());
    await userEvent.click(screen.getByRole("button", { name: "Size chart" }));
    expect(await screen.findByRole("heading", { name: "Shoe size conversion" })).toBeInTheDocument();
    const table = within(screen.getByRole("region", { name: "Shoe size conversion" })).getByRole("table");
    expect(within(table).getByRole("row", { name: /42 8 9 26\.7/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Kids" }));
    expect(within(table).queryByRole("columnheader", { name: "UK" })).toBeNull();
  });

  it("has no serious accessibility violations", async () => {
    const { container } = mount(shoes());
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe("scaleLabels helpers", () => {
  it("resolves in order: stored value, axis.scale, then the type table", () => {
    const axis = { key: "length", values: [] };
    expect(scaleIdFor({ productType: "led-strip" }, axis)).toBe("length");
    expect(scaleIdFor({ productType: null }, axis)).toBeNull();
    expect(scaleIdFor({ productType: "led-strip" }, { ...axis, scale: "weight" })).toBe("weight");
    expect(storedOf({}, axis, { label: "x", stored: { scale: "length", value: 5, unit: "m" } })).toMatchObject({ scale: "length", value: 5 });
    expect(labelFor({ productType: "led-strip" }, axis, { label: "5 m" })).toBe("5 m");
    expect(labelFor({}, axis, { label: "5 metres" })).toBe("5 metres");
  });
  it("never throws on odd input", () => {
    expect(labelFor(null, null, null)).toBe("");
    expect(labelFor({ productType: "sofa" }, { key: "seats" }, { label: "???" })).toBe("???");
    expect(dimensionsText({ length: 0, width: 1, height: 1 })).toBe("");
    expect(dimensionsText(null)).toBe("");
  });
});
