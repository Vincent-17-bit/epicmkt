import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FlashSales from "./FlashSales.jsx";
import PageBreadcrumbs from "../components/PageBreadcrumbs.jsx";

const logEvent = vi.hoisted(() => vi.fn());
vi.mock("../api/index.js", () => ({
  logEvent,
  getBusiness: vi.fn(),
  getCategories: vi.fn(async () => []),
  getTowns: vi.fn(async () => []),
  getSearchFacets: vi.fn(),
  flash: {
    list: vi.fn(async () => ({ items: [], total: 0 })),
    facets: vi.fn(async () => ({ total: 0, categories: [], towns: [] }))
  }
}));

let go;
function Nav() {
  go = useNavigate();
  return null;
}

const mount = (entry, children) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Nav />
        <main id="main" />
        {children}
      </QueryClientProvider>
    </MemoryRouter>
  );

const crumbs = () => screen.getAllByRole("listitem").map((li) => li.textContent.trim()).filter(Boolean);

describe("flash and offers breadcrumb edge cases", () => {
  it("renders the trail on the empty state, which is not a 404", async () => {
    mount("/flash?category=barbershop", <FlashSales />);
    expect(await screen.findByText(/No flash sales/)).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Flash sales", { selector: "[aria-current='page']" })).toBeInTheDocument();
  });

  it("renders two crumbs on direct entry, with a plain-text current page", () => {
    mount("/flash", <PageBreadcrumbs />);
    const current = screen.getByText("Flash sales", { selector: "[aria-current='page']" });
    expect(current.closest("a")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });

  it("keeps trail and JSON-LD consistent on back and forward between /flash and /offers", async () => {
    mount("/flash", <PageBreadcrumbs />);
    await act(async () => go("/offers"));
    expect(screen.getByText("Offers", { selector: "[aria-current='page']" })).toBeInTheDocument();
    expect(screen.queryByText("Flash sales")).not.toBeInTheDocument();
    await act(async () => go(-1));
    expect(screen.getByText("Flash sales", { selector: "[aria-current='page']" })).toBeInTheDocument();
    expect(screen.queryByText("Offers")).not.toBeInTheDocument();
    await act(async () => go(1));
    expect(screen.getByText("Offers", { selector: "[aria-current='page']" })).toBeInTheDocument();
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(1);
  });

  it("logs the Home click and resets the main scroll", async () => {
    logEvent.mockClear();
    mount("/flash", <PageBreadcrumbs />);
    const main = document.getElementById("main");
    main.scrollTo = vi.fn();
    await userEvent.setup().click(screen.getByRole("link", { name: "Home" }));
    expect(logEvent).toHaveBeenCalledWith("breadcrumb_click", { level: 0, target: "/" });
    expect(main.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
