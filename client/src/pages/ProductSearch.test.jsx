import { describe, expect, it, vi, beforeAll } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureAxe } from "vitest-axe";
import { setLatency } from "@epicmkt/backend";

vi.mock("../api/index.js", async (load) => ({ ...(await load()), logEvent: vi.fn() }));
const { default: ProductSearch } = await import("./ProductSearch.jsx");
const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });

beforeAll(() => setLatency(0));

const mount = (url) => {
  const router = createMemoryRouter([{ path: "/products", element: <ProductSearch /> }, { path: "*", element: <p>elsewhere</p> }], { initialEntries: [url] });
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, ...view };
};
const results = () => within(screen.getByRole("region", { name: "Search results" }));

describe("product search (/products)", () => {
  it("lists the speakers with the filters speakers need, and nothing to add to a cart", async () => {
    mount("/products?q=speakers");
    expect(await screen.findByText(/results for/)).toBeInTheDocument();
    const filters = within(screen.getByRole("complementary", { name: "Filters" }));
    for (const title of ["Speaker type", "Brand", "Connectivity", "Price"]) expect(filters.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(filters.queryByRole("heading", { name: /Screen size/ })).toBeNull();
    // Every result is a speaker, so a Department filter would change nothing: it is left out.
    expect(filters.queryByRole("heading", { name: "Department" })).toBeNull();
    expect(results().getAllByRole("link", { name: /JBL Flip 6/ }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/add to (cart|basket)/i);
    expect(document.body.textContent).not.toMatch(/review|rating|stars/i);
  });

  it("ticking a brand narrows the results and goes into the page address, so the link can be shared", async () => {
    const { router } = mount("/products?q=speakers");
    const filters = within(await screen.findByRole("complementary", { name: "Filters" }));
    const brand = await filters.findByRole("checkbox", { name: /^JBL/ });
    fireEvent.click(brand);
    await waitFor(() => expect(router.state.location.search).toContain("brand=jbl"));
    await waitFor(() => expect(results().queryByRole("link", { name: /Oraimo/ })).toBeNull());
    expect(results().getAllByRole("link", { name: /JBL/ }).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Remove Brand: JBL" })).toBeInTheDocument();
  });

  it("says so plainly when nothing matches", async () => {
    mount("/products?q=zzzzqqqq");
    expect(await screen.findByRole("heading", { name: /No products match/ })).toBeInTheDocument();
  });

  it("has no serious accessibility problems", async () => {
    const { container } = mount("/products?q=speakers");
    await screen.findByText(/results for/);
    const found = (await axe(container)).violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(found.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
  });

  it("shows the top filters as quick chips above the results, each opening its options", async () => {
    mount("/products?q=speakers");
    const row = await screen.findByRole("list", { name: "Top filters" });
    const chips = within(row).getAllByRole("button");
    expect(chips.length).toBeLessThanOrEqual(6);
    expect(chips[0]).toHaveTextContent("Speaker type");
    fireEvent.click(chips[1]);
    const panel = await screen.findByRole("region", { name: /Brand filter/ });
    expect(within(panel).getAllByRole("checkbox").length).toBeGreaterThan(1);
    fireEvent.click(within(panel).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("region", { name: /Brand filter/ })).toBeNull();
  });

  it("separates products and services: tabs with counts, and a service card never shows stock", async () => {
    const { router } = mount("/products?q=wash");
    const tabs = within(await screen.findByRole("navigation", { name: "What to search" }));
    const services = await tabs.findByRole("button", { name: /^Services \d+/ });
    expect(tabs.getByRole("button", { name: /^Products \d+/ })).toBeInTheDocument();
    fireEvent.click(services);
    await waitFor(() => expect(router.state.location.search).toContain("t=service"));
    await waitFor(() => expect(results().getAllByText(/View service|See options/).length).toBeGreaterThan(0));
    expect(results().queryByText("View item")).toBeNull();
    expect(results().queryByText(/only \d+ left|low stock/i)).toBeNull();
    expect(results().queryByText(/Pick up/)).toBeNull();
  });

  it("loads a page at a time: page links, and Load more after the first pages", async () => {
    const { router } = mount("/products?q=a");
    expect(await screen.findByText(/results for/)).toBeInTheDocument();
    const pager = await screen.findByRole("navigation", { name: "Result pages" });
    fireEvent.click(within(pager).getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(router.state.location.search).toContain("page=2"));
    expect(await within(await screen.findByRole("navigation", { name: "Result pages" })).findByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    const more = screen.queryByRole("button", { name: "Load more results" });
    if (more) {
      const before = results().getAllByRole("listitem").length;
      fireEvent.click(more);
      await waitFor(() => expect(results().getAllByRole("listitem").length).toBeGreaterThan(before));
      expect(within(screen.getByRole("navigation", { name: "Result pages" })).getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
    }
  });
});
