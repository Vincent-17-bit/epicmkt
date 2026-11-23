import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const adminAccess = vi.fn();
vi.mock("../api/index.js", () => ({ adminAccess: (...a) => adminAccess(...a) }));
const { default: AdminAccess } = await import("./AdminAccess.jsx");
const { getAdminAccess } = await import("../lib/adminAccess.js");

const show = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={["/admin-access"]}>
      <Routes>
        <Route path="/admin-access" element={<AdminAccess />} />
        <Route path="/business/catalog" element={<p>the catalogue</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => { adminAccess.mockReset(); window.sessionStorage.clear(); });
afterEach(cleanup);

describe("admin access page", () => {
  it("signs in with the token, removes it from the address bar and opens My listings with the admin bar remembered", async () => {
    window.location.hash = "#token_hash=tok-ok&business=Sunrise%20Bakery&seller=ES1&admin=https%3A%2F%2Fadmin.test";
    adminAccess.mockResolvedValue({ ok: true });
    show();
    expect(await screen.findByText("the catalogue")).toBeInTheDocument();
    expect(adminAccess).toHaveBeenCalledTimes(1);
    expect(adminAccess).toHaveBeenCalledWith("tok-ok");
    expect(window.location.hash).toBe("");
    expect(getAdminAccess()).toEqual({ business: "Sunrise Bakery", seller: "ES1", admin: "https://admin.test" });
  });

  it("says the link no longer works when the token is refused, and remembers nothing", async () => {
    window.location.hash = "#token_hash=tok-used&business=X";
    adminAccess.mockRejectedValue(new Error("used"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("This link no longer works");
    expect(getAdminAccess()).toBeNull();
  });

  it("says the same when there is no token at all, without calling anything", async () => {
    window.location.hash = "";
    show();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(adminAccess).not.toHaveBeenCalled();
  });
});
