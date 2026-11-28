import { render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as departmentsApi from "../api/departments.js";
import { getTrail } from "../utils/getTrail.js";
import { seriousViolations } from "../test/axe.js";
import Department, { priceLabel } from "./Department.jsx";

vi.mock("../api/departments.js", () => ({ getDepartments: vi.fn(), getDepartmentBrowse: vi.fn() }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => null }));

const DEPARTMENTS = [
  { id: "phones", name: "Phones", sort: 1, count: 2, types: [{ id: "phone", name: "Phone", count: 2 }, { id: "charger", name: "Charger", count: 0 }] },
  { id: "furniture", name: "Furniture", sort: 2, count: 1, types: [{ id: "table", name: "Table", count: 1 }] }
];
const cyberItem = { id: "i1", name: "Galaxy A15", price: 18500, priceType: "fixed", hasOptions: true, image: null, shop: { id: "b1", slug: "cyber-hub", name: "Cyber Hub", town: "Kisumu" } };

const view = (path) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/d/:department" element={<Department />} />
          <Route path="/d/:department/:type" element={<Department />} />
          <Route path="*" element={<p>other</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

afterEach(() => vi.clearAllMocks());

describe("Department page", () => {
  it("shows a phone from a cyber shop under Phones, linking to the item", async () => {
    departmentsApi.getDepartments.mockResolvedValue(DEPARTMENTS);
    departmentsApi.getDepartmentBrowse.mockResolvedValue({ total: 1, items: [cyberItem] });
    view("/d/phones");
    const link = await screen.findByRole("link", { name: /Galaxy A15/ });
    expect(link).toHaveAttribute("href", "/b/cyber-hub/i/i1");
    const card = link.closest("div");
    expect(card).toHaveTextContent("Cyber Hub");
    expect(card).toHaveTextContent("Kisumu");
    expect(card).toHaveTextContent(/From KES 18,500/);
    expect(within(card).getByRole("button", { name: "Save Galaxy A15" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Phones" })).toBeInTheDocument();
  });

  it("filters by type and marks the chosen one", async () => {
    departmentsApi.getDepartments.mockResolvedValue(DEPARTMENTS);
    departmentsApi.getDepartmentBrowse.mockResolvedValue({ total: 1, items: [cyberItem] });
    view("/d/phones/phone");
    await screen.findByRole("link", { name: /Galaxy A15/ });
    expect(departmentsApi.getDepartmentBrowse).toHaveBeenCalledWith("phones", "phone", { limit: 24, offset: 0 });
    expect(screen.getByRole("link", { name: /^Phone/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All" })).not.toHaveAttribute("aria-current");
  });

  it("says so when empty, and offers a retry on failure", async () => {
    departmentsApi.getDepartments.mockResolvedValue(DEPARTMENTS);
    departmentsApi.getDepartmentBrowse.mockResolvedValueOnce({ total: 0, items: [] });
    const first = view("/d/furniture");
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
    first.unmount();
    departmentsApi.getDepartmentBrowse.mockRejectedValue(new Error("x"));
    view("/d/furniture");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows the not-found page for an unknown department or type", async () => {
    departmentsApi.getDepartments.mockResolvedValue(DEPARTMENTS);
    departmentsApi.getDepartmentBrowse.mockResolvedValue({ total: 0, items: [] });
    view("/d/nope");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("has no serious accessibility problems", async () => {
    departmentsApi.getDepartments.mockResolvedValue(DEPARTMENTS);
    departmentsApi.getDepartmentBrowse.mockResolvedValue({ total: 1, items: [cyberItem] });
    const { container } = view("/d/phones");
    await screen.findByRole("link", { name: /Galaxy A15/ });
    await waitFor(async () => expect(await seriousViolations(container)).toEqual([]));
  });
});

describe("price label and breadcrumbs", () => {
  it("says From only when the price varies", () => {
    expect(priceLabel({ price: 500, priceType: "fixed" })).toBe("KES 500");
    expect(priceLabel({ price: 500, priceType: "from" })).toBe("From KES 500");
    expect(priceLabel({ price: null })).toBe("");
  });

  const base = { pathname: "/d/phones/phone", categories: { status: "success", data: [] }, towns: { status: "success", data: [] }, business: { status: "success" } };
  it("trails Home > Phones > Phone", () => {
    const r = getTrail({ ...base, departments: { status: "success", data: DEPARTMENTS } });
    expect(r.trail.map((c) => c.label)).toEqual(["Home", "Phones", "Phone"]);
    expect(r.trail[1].to).toBe("/d/phones");
    expect(r.trail[2].to).toBeUndefined();
  });
  it("is not-found for an unknown type and loading while departments load", () => {
    expect(getTrail({ ...base, pathname: "/d/phones/zzz", departments: { status: "success", data: DEPARTMENTS } }).status).toBe("not-found");
    expect(getTrail({ ...base, departments: { status: "pending" } }).status).toBe("loading");
  });
  it("leaves category routes alone", () => {
    const r = getTrail({ ...base, pathname: "/c/barber", categories: { status: "success", data: [{ id: "barber", name: "Barber" }] } });
    expect(r.trail.map((c) => c.label)).toEqual(["Home", "Barber"]);
  });
});
