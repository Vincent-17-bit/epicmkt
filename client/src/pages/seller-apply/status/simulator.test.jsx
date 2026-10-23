import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminSimulator from "./AdminSimulator.jsx";

const KEY = "epicmkt.mock.applications";
const real = { referenceNo: "REAL01", status: "submitted", payload: { business: { name: "Real Bakery" } } };

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AdminSimulator />
  </QueryClientProvider>
);

beforeEach(() => localStorage.setItem(KEY, JSON.stringify([real])));

describe("admin simulator demo data", () => {
  it("loads demo applications and clears only them, leaving real applications alone", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Admin simulator" }));

    await user.click(screen.getByRole("button", { name: "Load demo data" }));
    await waitFor(() => expect(screen.getAllByRole("option", { name: /DEMO0/ }).length).toBeGreaterThan(0));
    expect(screen.getAllByRole("option", { name: /REAL01/ })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Clear demo data" }));
    await waitFor(() => expect(screen.queryAllByRole("option", { name: /DEMO0/ })).toHaveLength(0));
    expect(screen.getAllByRole("option", { name: /REAL01/ })).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(KEY)).map((a) => a.referenceNo)).toEqual(["REAL01"]);
  });
});
