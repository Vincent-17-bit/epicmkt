import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const row = (key, over = {}) => ({ key, label: key[0].toUpperCase() + key.slice(1), level: "optional", input: "text", ...over });
const TYPES = [{ id: "ring", name: "Ring", specRows: [row("material", { level: "required" }), row("purity", { requiredIf: { row: "material", equals: "Gold" }, showIf: { row: "material", present: true } })] }, { id: "empty", name: "Empty", specRows: [] }];
const api = { listSpecTypes: vi.fn(async () => structuredClone(TYPES)), saveSpecRows: vi.fn(async (_id, rows) => rows) };
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: SpecRulesPage } = await import("./SpecRulesPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><SpecRulesPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => { mockRole = "owner"; api.saveSpecRows.mockClear(); });
afterEach(cleanup);

describe("SpecRulesPage", () => {
  it("shows the rows of the first type, the required count and the seller preview", async () => {
    renderPage();
    expect(await screen.findByRole("group", { name: /Row 1: Material/ })).toBeInTheDocument();
    expect(screen.getByText(/Required rows: 2 of 4/)).toBeInTheDocument();
    const preview = screen.getByTestId("spec-preview");
    expect(within(preview).getByLabelText(/Material/)).toBeInTheDocument();
    expect(within(preview).queryByLabelText(/Purity/)).toBeNull();
  });

  it("the preview reveals and requires a conditional row", async () => {
    renderPage();
    const preview = await screen.findByTestId("spec-preview");
    fireEvent.change(within(preview).getByLabelText(/Material/), { target: { value: "Gold" } });
    expect(within(preview).getByLabelText(/Purity/)).toBeInTheDocument();
    expect(within(preview).getByText(/Purity is required/)).toBeInTheDocument();
  });

  it("saves edited rows", async () => {
    renderPage();
    const card = await screen.findByRole("group", { name: /Row 1: Material/ });
    fireEvent.change(within(card).getByLabelText("Level"), { target: { value: "recommended" } });
    fireEvent.click(screen.getByRole("button", { name: "Save rules" }));
    await waitFor(() => expect(api.saveSpecRows).toHaveBeenCalled());
    expect(api.saveSpecRows.mock.calls[0][0]).toBe("ring");
    expect(api.saveSpecRows.mock.calls[0][1][0].level).toBe("recommended");
  });

  it("refuses a fifth required row and disables saving", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Row 1: Material/ });
    for (const label of ["A1", "A2", "A3"]) {
      fireEvent.click(screen.getByRole("button", { name: "Add row" }));
      const cards = screen.getAllByRole("group", { name: /^Row \d/ });
      const card = cards[cards.length - 1];
      fireEvent.change(within(card).getByLabelText("Label"), { target: { value: label } });
      fireEvent.change(within(card).getByLabelText("Level"), { target: { value: "required" } });
    }
    expect(screen.getByText(/Required rows: 5 of 4/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/at most 4/);
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
  });

  it("blocks removing a row that a rule uses", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Row 1: Material/ });
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(screen.getAllByRole("group", { name: /^Row \d/ })).toHaveLength(2);
    expect(screen.getByText(/Another row uses/)).toBeInTheDocument();
  });

  it("a choice row offers the label sets", async () => {
    renderPage();
    const card = await screen.findByRole("group", { name: /Row 1: Material/ });
    fireEvent.change(within(card).getByLabelText("Input"), { target: { value: "choice" } });
    expect(within(card).getByLabelText("Label set")).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText("Label set"), { target: { value: "condition" } });
    expect(within(screen.getByTestId("spec-preview")).getByRole("option", { name: "Refurbished" })).toBeInTheDocument();
  });

  it("other roles see the rules but cannot save", async () => {
    mockRole = "reviewer";
    renderPage();
    const card = await screen.findByRole("group", { name: /Row 1: Material/ });
    expect(card).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
  });

  it("switching type shows its own rows", async () => {
    renderPage();
    await screen.findByRole("group", { name: /Row 1: Material/ });
    fireEvent.change(screen.getByLabelText("Product type"), { target: { value: "empty" } });
    expect(await screen.findByText(/no rows yet/)).toBeInTheDocument();
  });
});
