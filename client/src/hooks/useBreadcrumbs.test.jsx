import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBreadcrumbs } from "./useBreadcrumbs.js";

const biz = { id: "b_001", slug: "fade-kings", name: "Fade Kings", categoryId: "barbershops", townSlug: "maseno", services: [{ id: "fade", name: "Fade" }] };

vi.mock("../api/index.js", () => ({
  getBusiness: vi.fn(async () => biz),
  getCategories: vi.fn(async () => [{ id: "barbershops", slug: "barbershops", name: "Barbershops" }]),
  getTowns: vi.fn(async () => [{ slug: "maseno", name: "Maseno" }]),
  getSearchFacets: vi.fn()
}));

const run = (client) =>
  renderHook(() => useBreadcrumbs(), {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={["/b/fade-kings?item=fade"]}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </MemoryRouter>
    )
  });

const gone = () => Object.assign(new Error("nf"), { name: "NotFoundError" });

describe("useBreadcrumbs item unavailable", () => {
  it("replaces the last crumb with plain Item unavailable when a loaded item vanishes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["item", "b_001", "fade"], { id: "fade" });
    const { result } = run(client);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trail.at(-1).label).toBe("Fade");

    await client.fetchQuery({ queryKey: ["item", "b_001", "fade"], queryFn: () => Promise.reject(gone()), staleTime: 0 }).catch(() => {});
    await waitFor(() => expect(result.current.trail.at(-1).label).toBe("Item unavailable"));
    expect(result.current.trail.at(-1).to).toBeUndefined();
    expect(result.current.trail.at(-2).to).toBe("/b/fade-kings");
  });

  it("leaves the trail alone when the item never loaded", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.fetchQuery({ queryKey: ["item", "b_001", "fade"], queryFn: () => Promise.reject(gone()) }).catch(() => {});
    const { result } = run(client);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.trail.at(-1).label).toBe("Fade");
  });
});
