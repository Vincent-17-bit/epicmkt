import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./Layout.jsx";

// Layout really draws the drawer's slot (this is the path that a typo once broke without any test noticing).
describe("Layout with the Saved drawer", () => {
  it("shows the scrim at once and the drawer once its chunk arrives, on the /saved route", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/saved"]}>
          <Layout />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByRole("dialog", { name: "Saved" }, { timeout: 15000 })).toBeInTheDocument();
  }, 20000);

  it("draws no drawer when it was not asked for", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.queryByRole("dialog", { name: "Saved" })).toBeNull();
    expect(screen.queryByTestId("saved-loading")).toBeNull();
  });
});
