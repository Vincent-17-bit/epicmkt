import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Offers from "./Offers.jsx";

vi.mock("../api/index.js", () => ({
  logEvent: vi.fn(),
  getBusiness: vi.fn(),
  getCategories: vi.fn(async () => []),
  getTowns: vi.fn(async () => []),
  getSearchFacets: vi.fn(),
  offers: {
    list: vi.fn(() => new Promise(() => {})),
    facets: vi.fn(async () => ({ total: 0, categories: [], towns: [] }))
  }
}));

const mount = () =>
  render(
    <MemoryRouter initialEntries={["/offers"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <main id="main" />
        <Offers />
      </QueryClientProvider>
    </MemoryRouter>
  );

const setOnline = (value) => Object.defineProperty(window.navigator, "onLine", { configurable: true, value });

afterEach(() => setOnline(true));

describe("Offers while waiting for data", () => {
  it("shows the loading placeholders when online", () => {
    setOnline(true);
    mount();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says it is offline instead of loading forever when there is no connection", () => {
    setOnline(false);
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Offline: may be out of date");
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
