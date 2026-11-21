import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { getFixture } from "@epicmkt/shared";
import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { seriousViolations } from "../../test/axe.js";
import Options from "./Options.jsx";
import Header, { unitPriceFor, unitPricesFor } from "./Header.jsx";

// The unit price line sits under the price, so the harness draws the picker and the header slot the way the page does.
function Harness({ item }) {
  const option = useOptionSelection(item, item.id);
  return (
    <>
      <Options ctx={{ option }} slot={{ item }} />
      <Header ctx={{ option }} slot={{ item, Heading: "h1", headingRef: null, pricing: item.pricing, shown: null }} />
    </>
  );
}
const mount = (id, url = "/") => render(<MemoryRouter initialEntries={[url]}><Harness item={getFixture(id).detail} /></MemoryRouter>);

describe("unit price under the price", () => {
  it("bread: per kg for the chosen weight, following the pick", async () => {
    const user = userEvent.setup();
    mount("fx-bread");
    expect(screen.getByTestId("unit-price")).toHaveTextContent("KES 150 per kg");
    await user.click(screen.getByRole("radio", { name: /800 g/ }));
    expect(screen.getByTestId("unit-price")).toHaveTextContent("KES 138 per kg");
  });

  it("water: per L follows both options", async () => {
    const user = userEvent.setup();
    mount("fx-water");
    expect(screen.getByTestId("unit-price")).toHaveTextContent("per L");
    await user.click(screen.getByRole("radio", { name: /20 L/ }));
    expect(screen.getByTestId("unit-price")).toHaveTextContent(/KES \d+ per L/);
  });

  it("shows nothing for sizes that are not a weight or a volume (shoes)", () => {
    mount("fx-shoes");
    expect(screen.queryByTestId("unit-price")).not.toBeInTheDocument();
  });

  it("gives a price per piece for a pack size, from the sale price when there is one", () => {
    const option = (size, variant) => ({ axes: [{ key: "pack", values: [{ id: "a", label: size }] }], choice: { pack: "a" }, variant });
    expect(unitPriceFor(option("Pack of 6", { price: 1500 }))?.text).toBe("KES 250 per piece");
    expect(unitPriceFor(option("Pack of 6", { price: 1500, salePrice: 1200 }))?.text).toBe("KES 200 per piece");
    expect(unitPriceFor(option("42", { price: 1500 }))).toBeNull();
  });

  it("a multipack shows per piece and per litre together", () => {
    const option = { axes: [{ key: "size", values: [{ id: "a", label: "6 x 500 ml" }] }], choice: { size: "a" }, variant: { price: 1200 } };
    expect(unitPricesFor(option).map((x) => x.text)).toEqual(["KES 200 per piece", "KES 400 per L"]);
  });

  it("falls back to the one size in the item name, with the price shown, only where a measure is credible", () => {
    const names = (item, shown) => unitPricesFor(null, item, shown).map((x) => x.text);
    expect(names({ name: "Soda 24 Pack" }, { price: 2400 })).toEqual(["KES 100 per piece"]);
    expect(names({ name: "Soda 24 Pack" }, { price: 2400, salePrice: 1200 })).toEqual(["KES 50 per piece"]);
    expect(names({ name: "Soda 24 Pack" }, null)).toEqual([]);
    expect(names({ name: "Bread 400g", productType: "bread" }, { price: 60 })).toEqual(["KES 150 per kg"]);
    expect(names({ name: "Sugar 2 kg" }, { price: 300 })).toEqual([]);
    expect(names({ name: "Tecno Spark 8 L" }, { price: 20000 })).toEqual([]);
    expect(names({ name: "Tecno Spark 8 L", productType: "phone" }, { price: 20000 })).toEqual([]);
    expect(names({ name: "Soda" }, { price: 2400 })).toEqual([]);
  });

  it("says nothing for a service, and no weight price for gold or electronics", () => {
    const option = (size) => ({ axes: [{ key: "s", values: [{ id: "a", label: size }] }], choice: { s: "a" }, variant: { price: 100000 } });
    expect(unitPricesFor(option("5 g"), { name: "Chain", productType: "gold-necklace" })).toEqual([]);
    expect(unitPricesFor(option("1 L"), { name: "Cleaning", kind: "service" })).toEqual([]);
    expect(unitPricesFor(option("Pack of 4"), { name: "Chain", productType: "gold-necklace" }).map((x) => x.text)).toEqual(["KES 25,000 per piece"]);
  });

  it("has no serious accessibility violations", async () => {
    const { container } = mount("fx-bread");
    expect(await seriousViolations(container)).toEqual([]);
  });
});
