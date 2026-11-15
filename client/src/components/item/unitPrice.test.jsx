import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { getFixture } from "@epicmkt/shared";
import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { seriousViolations } from "../../test/axe.js";
import Options from "./Options.jsx";
import Header from "./Header.jsx";

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

  it("has no serious accessibility violations", async () => {
    const { container } = mount("fx-bread");
    expect(await seriousViolations(container)).toEqual([]);
  });
});
