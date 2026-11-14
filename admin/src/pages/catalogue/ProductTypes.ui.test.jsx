import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
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
};
const api = { listTypeSettings: vi.fn(async () => structuredClone(DATA)), saveTypeSettings: vi.fn(async (id, input) => ({ id, ...input })) };
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: ProductTypesPage } = await import("./ProductTypesPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><ProductTypesPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => { mockRole = "owner"; api.saveTypeSettings.mockClear(); });
afterEach(cleanup);

describe("ProductTypesPage", () => {
  it("shows the first type with its options and item count", async () => {
    renderPage();
    expect(await screen.findByRole("group", { name: /Option 1: Colour/ })).toBeInTheDocument();
    expect(screen.getByText("3 items use this type.")).toBeInTheDocument();
    expect(screen.getByLabelText("Electronics")).toBeChecked();
    expect(screen.getByLabelText("Fashion")).not.toBeChecked();
  });

  it("saves a renamed option together with new suggested values", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    fireEvent.change(screen.getByLabelText(/Suggested values/), { target: { value: "Black, Grey" } });
    fireEvent.click(screen.getByRole("button", { name: "Save type" }));
    await waitFor(() => expect(api.saveTypeSettings).toHaveBeenCalled());
    const [id, input] = api.saveTypeSettings.mock.calls[0];
    expect(id).toBe("phone");
    expect(input.axes[0]).toEqual({ key: "colour", label: "Colour", display: "swatch", suggested: [{ id: "black", label: "Black" }, { id: "grey", label: "Grey" }] });
  });

  it("creates a new type with an id made from its name", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Option 1/ });
    fireEvent.change(screen.getByLabelText("Product type"), { target: { value: "__new" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Hard drives" } });
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    fireEvent.change(screen.getByLabelText("Name", { selector: "fieldset input" }), { target: { value: "Capacity" } });
    fireEvent.click(screen.getByRole("button", { name: "Create type" }));
    await waitFor(() => expect(api.saveTypeSettings).toHaveBeenCalled());
    expect(api.saveTypeSettings.mock.calls[0][0]).toBe("hard-drives");
    expect(api.saveTypeSettings.mock.calls[0][1].axes[0].key).toBe("capacity");
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
    expect(screen.getByRole("button", { name: "Save type" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add option" })).toBeDisabled();
    expect(screen.queryByRole("option", { name: "New type" })).toBeNull();
  });
});
