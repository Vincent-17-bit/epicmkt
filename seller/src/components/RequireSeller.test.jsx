import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "../api/errors.js";
import RequireSeller from "./RequireSeller.jsx";

const state = vi.hoisted(() => ({ error: null }));
vi.mock("../api/index.js", () => ({
  getSubscription: async () => {
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
});
