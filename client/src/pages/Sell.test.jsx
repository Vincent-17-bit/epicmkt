import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import Sell from "./Sell.jsx";
import { resetPricing, setLimitsOverride, setPlanOverride } from "../api/applications/mockStore.js";

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Sell />
      </MemoryRouter>
    </QueryClientProvider>
  );

afterEach(() => {
  resetPricing();
  localStorage.clear();
});

describe("Sell page reads plans from the API", () => {
  it("shows the lowest Standard price in the hero and a table for the cheapest category", async () => {
    mount();
    const table = await screen.findByRole("table", { name: /comparison of standard and premium/i });
    expect(screen.getByText(/Plans start at KSh 300 a month/)).toBeInTheDocument();
    expect(within(table).getByText("KSh 300")).toBeInTheDocument();
    expect(within(table).getByText("KSh 800")).toBeInTheDocument();
  });

  it("changes prices when the category changes, with no code change", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByRole("table", { name: /comparison/i });
    await user.selectOptions(screen.getByLabelText(/prices for/i), "restaurant-cafe");
    const table = screen.getByRole("table", { name: /comparison/i });
    expect(within(table).queryByText("KSh 300")).not.toBeInTheDocument();
    expect(within(table).getAllByText(/^KSh [\d,]+$/).length).toBe(2);
  });

  it("picks up an admin edit to a price, benefit, limit and trial on the next load", async () => {
    setPlanOverride("water-refill", "standard", { price: 350, items: 20, topBenefits: ["Edited one", "Edited two", "Edited three"], trialDays: 7 });
    setLimitsOverride("standard", { faqs: 9 });
    const user = userEvent.setup();
    mount();
    await screen.findByRole("table", { name: /comparison/i });
    await user.selectOptions(screen.getByLabelText(/prices for/i), "water-refill");
    const table = screen.getByRole("table", { name: /comparison/i });
    expect(within(table).getByText("KSh 350")).toBeInTheDocument();
    expect(within(table).getByText("Edited two")).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /items you can list/i })).getByText("Up to 20")).toBeInTheDocument();
    expect(within(within(table).getByRole("row", { name: /^faqs/i })).getByText("Up to 9")).toBeInTheDocument();
    expect(within(table).getByText("7-day free trial")).toBeInTheDocument();
  });

  it("does not use the old hard-coded 500 and 1,500 prices", async () => {
    mount();
    await screen.findByRole("table", { name: /comparison/i });
    expect(screen.queryByText("KSh 500")).not.toBeInTheDocument();
    expect(screen.queryByText("KSh 1,500")).not.toBeInTheDocument();
  });
});
