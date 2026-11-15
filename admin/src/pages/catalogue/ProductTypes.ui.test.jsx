import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { axe } from "vitest-axe";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const DATA = {
  types: [
    { id: "phone", name: "Phone", kind: "good", departmentId: "phones", categoryIds: ["a"], active: true, items: 3, axes: [{ key: "colour", label: "Colour", display: "swatch" }] },
    { id: "shoes", name: "Shoes", kind: "good", departmentId: null, categoryIds: [], active: false, items: 0, axes: [] },
  ],
  departments: [{ id: "phones", name: "Phones" }],
  categories: [{ id: "a", name: "Electronics" }, { id: "b", name: "Fashion" }],
  sizeCharts: [{ id: "c1", name: "Women's shoes (EU)" }],
};
DATA.types[0].version = 2;
DATA.types[0].publishedAt = "2026-11-01T10:00:00Z";
const api = {
  listTypeSettings: vi.fn(async () => structuredClone(DATA)),
  saveTypeSettings: vi.fn(async (id, input) => ({ id, ...input })),
  saveTypeDraft: vi.fn(async (id, input) => ({ id, draft: input, draftUpdatedAt: "2026-11-15T10:00:00Z" })),
  publishTypeVersion: vi.fn(async (id) => ({ id, name: "Phone", version: 3 })),
  discardTypeDraft: vi.fn(async (id) => ({ id, draft: null })),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: ProductTypesPage } = await import("./ProductTypesPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><ProductTypesPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => { mockRole = "owner"; Object.values(api).forEach((f) => f.mockClear()); });
afterEach(cleanup);

describe("ProductTypesPage", () => {
  it("shows the first type with its options and item count", async () => {
    renderPage();
    expect(await screen.findByRole("group", { name: /Option 1: Colour/ })).toBeInTheDocument();
    expect(screen.getByText("3 items use this type.")).toBeInTheDocument();
    const sell = screen.getByRole("group", { name: "Categories that can sell it" });
    expect(within(sell).getByLabelText("Electronics")).toBeChecked();
    expect(within(sell).getByLabelText("Fashion")).not.toBeChecked();
    expect(screen.getByText("Live: version 2")).toBeInTheDocument();
  });

  it("saves new suggested values as a draft, without touching the live type", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    fireEvent.change(screen.getByLabelText(/Suggested values/), { target: { value: "Black, Grey" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.saveTypeDraft).toHaveBeenCalled());
    const [id, input] = api.saveTypeDraft.mock.calls[0];
    expect(id).toBe("phone");
    expect(input.axes[0]).toEqual({ key: "colour", label: "Colour", display: "swatch", suggested: [{ id: "black", label: "Black" }, { id: "grey", label: "Grey" }] });
    expect(api.saveTypeSettings).not.toHaveBeenCalled();
    expect(api.publishTypeVersion).not.toHaveBeenCalled();
  });

  it("publishes the next version with its scale, quantity mode, size chart and restriction", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    fireEvent.change(screen.getByLabelText("Measured with"), { target: { value: "shoe" } });
    fireEvent.change(screen.getByLabelText("Price changes with it"), { target: { value: "no" } });
    fireEvent.click(screen.getByLabelText("Sellers can type their own values"));
    fireEvent.change(screen.getByLabelText("How buyers choose a quantity"), { target: { value: "none" } });
    fireEvent.change(screen.getByLabelText("Size chart"), { target: { value: "c1" } });
    const only = screen.getByRole("group", { name: "Only these shop categories may sell it" });
    fireEvent.click(within(only).getByLabelText("Fashion"));
    fireEvent.change(screen.getByLabelText(/Version note/), { target: { value: "Sizes use the shoe scale" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish version 3" }));
    await waitFor(() => expect(api.publishTypeVersion).toHaveBeenCalledWith("phone", "Sizes use the shoe scale"));
    const input = api.saveTypeDraft.mock.calls[0][1];
    expect(input).toMatchObject({ quantityMode: "none", sizeChartId: "c1", restrictedTo: ["b"] });
    expect(input.axes[0]).toMatchObject({ scale: "shoe", open: true, affectsPrice: false });
  });

  it("creates a new type with an id made from its name", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    fireEvent.change(screen.getByLabelText("Product type"), { target: { value: "__new" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hard drives" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    fireEvent.change(screen.getByLabelText("Name", { selector: "fieldset input" }), { target: { value: "Capacity" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(api.saveTypeDraft).toHaveBeenCalled());
    expect(api.saveTypeDraft.mock.calls[0][0]).toBe("hard-drives");
    expect(api.saveTypeDraft.mock.calls[0][1].axes[0].key).toBe("capacity");
  });

  it("limits a type to three options", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    const add = screen.getByRole("button", { name: "Add option" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(add).toBeDisabled();
  });

  it("is read only for a reviewer", async () => {
    mockRole = "reviewer";
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish version 3" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add option" })).toBeDisabled();
    expect(screen.queryByRole("option", { name: "New type" })).toBeNull();
  });

  it("has no serious accessibility problems", async () => {
    const { container } = renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    const found = (await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(found.map((v) => v.id)).toEqual([]);
  });
});
