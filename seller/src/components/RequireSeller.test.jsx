import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/errors.js";
import * as api from "../api/index.js";
import RequireSeller from "./RequireSeller.jsx";

const state = vi.hoisted(() => ({ error: null, calls: 0 }));
vi.mock("../api/index.js", () => ({
  getSubscription: async () => {
    state.calls += 1;
    if (state.error) throw state.error;
    return { ok: true };
  },
}));

const visit = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/business"]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route element={<RequireSeller />}>
          <Route path="/business" element={<p>dashboard</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe("RequireSeller", () => {
  it.each([
    new ApiError("unauthorized"),
    new ApiError("not_a_seller"),
    new ApiError("permission denied for table businesses", "permission denied for table businesses"),
    new ApiError("JWT expired", "JWT expired"),
  ])("sends a signed-out visitor to the login page (%s)", async (error) => {
    state.error = error;
    visit();
    expect(await screen.findByText("login page")).toBeInTheDocument();
  });

  it("lets a signed-in seller through", async () => {
    state.error = null;
    visit();
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });

  it("does not send a signed-in seller to login on a network error", async () => {
    state.error = new ApiError("request_failed", "Failed to fetch");
    visit();
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
  });

  it("does not fall back to Loading forever when the subscription request keeps failing", async () => {
    state.error = new ApiError("request_failed", "function public.my_grace_days() does not exist");
    state.calls = 0;
    // Layout reads the same query. Its observer refetches the failed query on mount, which used to unmount the page again.
    const Shell = () => {
      useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
      return <p>shell</p>;
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/business"]}>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route element={<RequireSeller />}>
              <Route path="/business" element={<Shell />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("shell")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByText("shell")).toBeInTheDocument();
    expect(screen.queryByText("Loading")).toBeNull();
    expect(state.calls).toBeLessThan(5);
  });
});
