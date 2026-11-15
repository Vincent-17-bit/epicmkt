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
    for (const title of ["Department", "Brands", "Connectivity", "Price"]) expect(filters.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(filters.queryByRole("heading", { name: /Screen size/ })).toBeNull();
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
    expect(await screen.findByRole("button", { name: "Remove Brands: JBL" })).toBeInTheDocument();
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
});
