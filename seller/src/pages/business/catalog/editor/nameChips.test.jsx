import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import { emptyItemForm } from "@epicmkt/shared";
import BasicsSection from "./BasicsSection.jsx";

vi.mock("../../../../api/index.js", async (orig) => ({ ...(await orig()), getCatalog: async () => ({ items: [{ id: "it-1", name: "Philips LED bulb 9W" }] }) }));
vi.mock("../../../../components/values/useOpenValueSource.js", () => ({ useOpenValueSource: () => null }));

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const bulb = {
  id: "bulb", name: "LED bulb",
  specRows: [
    { key: "watts", label: "Wattage", level: "required", input: "text" },
    { key: "base", label: "Lamp base", level: "required", input: "text" }
  ]
};

function Harness({ isNew = true }) {
  const [form, setForm] = useState({ ...emptyItemForm(), productTypeId: "bulb" });
  const patch = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BasicsSection form={form} patch={patch} errors={{}} category="" sections={[]} focusOn={() => {}} type={bulb} isNew={isNew} />
        <output data-testid="specs">{JSON.stringify(form.specs)}</output>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("fill from the name", () => {
  it("offers chips from the name and fills a row only when one is tapped", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Candle bulb 9W E14");
    expect(screen.getByTestId("specs")).toHaveTextContent("[]");
    await user.click(screen.getByRole("button", { name: "Use 9 W for Wattage" }));
    expect(screen.getByTestId("specs")).toHaveTextContent('"label":"Wattage","value":"9 W"');
    expect(screen.queryByRole("button", { name: "Use 9 W for Wattage" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use E14 for Lamp base" }));
    expect(screen.getByTestId("specs")).toHaveTextContent('"value":"E14"');
    expect(screen.queryByRole("group", { name: "Found in the name" })).not.toBeInTheDocument();
  });

  it("shows no chips for a name with nothing to read", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Candle bulb");
    expect(screen.queryByRole("group", { name: "Found in the name" })).not.toBeInTheDocument();
  });
});

describe("duplicate guard", () => {
  it("asks on leaving the name, links to the item and can be dismissed", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Philips LED bulb 12W");
    expect(screen.queryByText(/You already sell/)).not.toBeInTheDocument();
    await user.tab();
    expect(await screen.findByText("You already sell Philips LED bulb 9W. Add this as another option instead?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Philips LED bulb 9W" })).toHaveAttribute("href", "/business/catalog/it-1/edit");
    const results = await axe(container);
    expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    await user.click(screen.getByRole("button", { name: "No, this is a different item" }));
    expect(screen.queryByText(/You already sell/)).not.toBeInTheDocument();
  });

  it("stays quiet when editing an existing item", async () => {
    const user = userEvent.setup();
    render(<Harness isNew={false} />);
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Philips LED bulb 12W");
    await user.tab();
    expect(screen.queryByText(/You already sell/)).not.toBeInTheDocument();
  });
});
