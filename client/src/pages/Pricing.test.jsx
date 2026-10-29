import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalogPricing } from "../api/applications/index.js";
import Pricing from "./Pricing.jsx";
import Sell from "./Sell.jsx";
import SellerGuide from "./SellerGuide.jsx";

vi.mock("../api/applications/index.js", () => ({ getCatalogPricing: vi.fn() }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => null }));

const plan = (price, features) => ({ price, topBenefits: [], features });
const catalog = {
  categories: [
    {
      id: "water",
      name: "Water refill station",
      plans: {
        standard: plan(300, { Visibility: ["Listed in search and category pages"], Catalog: ["Shop gallery of 5 photos"] }),
        premium: plan(800, { Visibility: ["Featured badge on shop card", "Listed in search and category pages"], Catalog: ["Shop gallery of 20 photos"] })
      }
    },
    {
      id: "chemist",
      name: "Chemist or pharmacy",
      plans: { standard: plan(1200, {}), premium: plan(3000, {}) }
    }
  ]
};

const view = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => vi.mocked(getCatalogPricing).mockReset());

describe("Pricing page", () => {
  it("shows the price for each type of business from the plan catalog", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    view(<Pricing />);
    const bands = await screen.findByRole("table", { name: "Monthly price by type of business" });
    const water = within(bands).getByRole("row", { name: /Water refill station/ });
    expect(within(water).getByText("KES 300")).toBeInTheDocument();
    expect(within(water).getByText("KES 800")).toBeInTheDocument();
    const chemist = within(bands).getByRole("row", { name: /Chemist or pharmacy/ });
    expect(within(chemist).getByText("KES 1,200")).toBeInTheDocument();
    expect(within(chemist).getByText("KES 3,000")).toBeInTheDocument();
  });

  it("compares the plans, showing both texts only where the plans differ", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    view(<Pricing />);
    const table = await screen.findByRole("table", { name: "Comparison of Standard and Premium plans" });
    expect(within(table).getByText("Shop gallery of 5 photos")).toBeInTheDocument();
    expect(within(table).getByText("Shop gallery of 20 photos")).toBeInTheDocument();
    expect(within(table).getByText("Featured badge on shop card: not included", { exact: false })).toBeInTheDocument();
    expect(within(table).getAllByText("From", { exact: false }).length).toBe(2);
  });

  it("sends every apply button to the real application", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    view(<Pricing />);
    await screen.findByRole("table", { name: /Comparison/ });
    for (const name of ["List my business", "Apply for Standard", "Apply for Premium"]) {
      for (const link of screen.getAllByRole("link", { name })) expect(link).toHaveAttribute("href", "/become-a-seller");
    }
  });

  it("points the plans PDF at the admin, with the message prepared", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    view(<Pricing />);
    await screen.findByRole("table", { name: /Comparison/ });
    expect(screen.getByRole("link", { name: "Get the plans PDF" })).toHaveAttribute("href", "/contact?topic=plans");
    expect(screen.getByRole("link", { name: /Ask for the plans PDF/ })).toHaveAttribute("href", "/contact?topic=plans");
  });

  it("never shows a price it could not load, and lets the visitor retry", async () => {
    vi.mocked(getCatalogPricing).mockRejectedValue(new Error("offline"));
    view(<Pricing />);
    expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent("We never show prices we cannot confirm");
    expect(screen.queryByText(/KES/)).not.toBeInTheDocument();
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: /Monthly price/ })).toBeInTheDocument();
  }, 10000);

  it("falls back to the admin when the catalog is empty", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue({ categories: [] });
    view(<Pricing />);
    expect(await screen.findByText(/Plans are not available to show right now/)).toBeInTheDocument();
  });

  it("answers pricing questions", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    view(<Pricing />);
    await userEvent.click(await screen.findByRole("button", { name: "When do I pay?" }));
    expect(screen.getByRole("button", { name: "When do I pay?" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Sell page uses the same catalog", () => {
  it("quotes the lowest real price and applies through the real application", async () => {
    vi.mocked(getCatalogPricing).mockResolvedValue(catalog);
    view(<Sell />);
    expect(await screen.findByText(/Plans start at KES 300 a month/)).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "List my business" })) expect(link).toHaveAttribute("href", "/become-a-seller");
    expect(screen.getByRole("link", { name: "pricing by type of business" })).toHaveAttribute("href", "/pricing");
  });
});

describe("Seller guide", () => {
  it("uses the shared document layout, with a contents list and the apply banner", () => {
    view(<SellerGuide />);
    expect(screen.getByRole("heading", { level: 1, name: "Seller guide" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Need help getting listed?" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Related pages" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Become a seller/ })).toHaveAttribute("href", "/become-a-seller");
    expect(screen.getByRole("link", { name: /Pricing/ })).toHaveAttribute("href", "/pricing");
  });
});
