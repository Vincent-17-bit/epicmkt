import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import * as mock from "../../api/mockDepartments.js";

const api = {
  listDepartments: vi.fn(mock.listDepartments), saveDepartment: vi.fn(mock.saveDepartment),
  listTypeRequests: vi.fn(mock.listTypeRequests), listRequestTypes: vi.fn(mock.listRequestTypes), resolveTypeRequest: vi.fn(mock.resolveTypeRequest)
};
vi.mock("../../api/index.js", () => ({ api, default: api }));
const { default: DepartmentsPage } = await import("./DepartmentsPage.jsx");
const { default: TypeRequestsPage } = await import("./TypeRequestsPage.jsx");
const renderPage = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
afterEach(() => { cleanup(); mock.resetDepartmentsMock(); Object.values(api).forEach((f) => f.mockClear()); });
const serious = async (container) => (await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.filter((v) => ["serious", "critical"].includes(v.impact));

describe("Departments", () => {
  it("lists departments with their counts", async () => {
    renderPage(<DepartmentsPage />);
    const row = (await screen.findByLabelText("Name of Phones")).closest("tr");
    expect(within(row).getByText("42")).toBeInTheDocument();
  });
  it("adds a department using a short name made from the title", async () => {
    renderPage(<DepartmentsPage />);
    await screen.findByLabelText("Name of Phones");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Home Decor" } });
    fireEvent.click(screen.getByRole("button", { name: "Add department" }));
    await waitFor(() => expect(api.saveDepartment).toHaveBeenCalledWith("home-decor", { name: "Home Decor" }));
    expect(await screen.findByText("Department added.")).toBeInTheDocument();
  });
  it("explains why a department in use cannot be hidden", async () => {
    renderPage(<DepartmentsPage />);
    const row = (await screen.findByLabelText("Name of Phones")).closest("tr");
    fireEvent.click(within(row).getByRole("checkbox"));
    expect(await screen.findByText(/Items still sit in this department/)).toBeInTheDocument();
  });
  it("saves a rename", async () => {
    renderPage(<DepartmentsPage />);
    const input = await screen.findByLabelText("Name of Furniture");
    fireEvent.change(input, { target: { value: "Home furniture" } });
    fireEvent.click(within(input.closest("tr")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveDepartment).toHaveBeenCalledWith("furniture", { name: "Home furniture", sort: 2 }));
  });
  it("has no serious accessibility violations", async () => {
    const { container } = renderPage(<DepartmentsPage />);
    await screen.findByLabelText("Name of Phones");
    expect(await serious(container)).toEqual([]);
  });
});

describe("Type requests", () => {
  it("shows who asked and how many others did too", async () => {
    renderPage(<TypeRequestsPage />);
    const card = (await screen.findByRole("heading", { name: "Smart watch" })).closest("li");
    expect(within(card).getByRole("link", { name: "Mobile Hub" })).toHaveAttribute("href", "/admin/businesses/s1");
    expect(card).toHaveTextContent("2 other shops asked too");
  });
  it("resolves with a chosen type, and the button waits for the choice", async () => {
    renderPage(<TypeRequestsPage />);
    const card = (await screen.findByRole("heading", { name: "Smart watch" })).closest("li");
    expect(within(card).getByRole("button", { name: "Resolve" })).toBeDisabled();
    await waitFor(() => expect(within(card).getByRole("option", { name: "Wearable" })).toBeInTheDocument());
    fireEvent.change(within(card).getByLabelText("Covered by type"), { target: { value: "wearable" } });
    fireEvent.click(within(card).getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(api.resolveTypeRequest).toHaveBeenCalledWith("r1", "resolved", "wearable", null));
    expect(await screen.findByText(/seller can now use that type/)).toBeInTheDocument();
  });
  it("will not decline without a note, and declines with one", async () => {
    renderPage(<TypeRequestsPage />);
    const card = (await screen.findByRole("heading", { name: "Baby cot" })).closest("li");
    fireEvent.click(within(card).getByRole("button", { name: "Decline" }));
    expect(await screen.findByText(/Tell the seller why/)).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Note to the seller"), { target: { value: "Use Cot under Furniture" } });
    await waitFor(() => expect(within(card).getByRole("button", { name: "Decline" })).toBeEnabled());
    fireEvent.click(within(card).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(api.resolveTypeRequest).toHaveBeenLastCalledWith("r2", "declined", null, "Use Cot under Furniture"));
  });
  it("has no serious accessibility violations", async () => {
    const { container } = renderPage(<TypeRequestsPage />);
    await screen.findByRole("heading", { name: "Smart watch" });
    expect(await serious(container)).toEqual([]);
  });
});
