import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SEED_SIZE_CHARTS, scales, shoeChartRows } from "@epicmkt/shared";
import { seriousViolations } from "../../test/axe.js";

let mockRole = "owner";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const chart = (over = {}) => ({ id: "c1", name: "Dresses and tops", category: null, unit: "cm", columns: ["Size", "Bust (cm)", "Waist (cm)"], rows: [["S", "84-88", "66"], ["M", "90", "72"]], active: true, updated_at: "2026-11-01T00:00:00Z", product_type_ids: ["dress"], items_using: 3, ...over });
const api = {
  listSizeCharts: vi.fn(), listProductTypes: vi.fn(), listCategories: vi.fn(), saveSizeChart: vi.fn(), deleteSizeChart: vi.fn(),
  getShoeConversion: vi.fn(), saveShoeConversion: vi.fn(),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: SizeChartsPage } = await import("./SizeChartsPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><SizeChartsPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);
const apiError = (code) => Object.assign(new Error(code), { code });

beforeEach(() => {
  mockRole = "owner";
  api.listSizeCharts.mockResolvedValue([chart(), chart({ id: "c2", name: "Shirt collar", unit: "in", columns: ["Collar (in)", "Shirt size"], rows: [["15", "M"]], product_type_ids: [], items_using: 0, active: false })]);
  api.listProductTypes.mockResolvedValue([{ id: "dress", name: "Dress", sizeChartId: "c1" }, { id: "shirt", name: "Shirt", sizeChartId: "c9" }]);
  api.listCategories.mockResolvedValue([{ id: "tailor", name: "Tailor" }]);
  api.saveSizeChart.mockResolvedValue("c1");
  api.deleteSizeChart.mockResolvedValue(undefined);
  api.getShoeConversion.mockResolvedValue({ chart: shoeChartRows(scales.SHOE_CHART), version: 4 });
  api.saveShoeConversion.mockResolvedValue(5);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Size charts: library", () => {
  it("lists charts with unit, rows, types and whether buyers see them", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Dresses and tops" })).toBeInTheDocument();
    expect(screen.getByText("2 rows")).toBeInTheDocument();
    expect(screen.getByText(/1 type: Dress/)).toBeInTheDocument();
    expect(screen.getByText("3 items use it")).toBeInTheDocument();
    expect(screen.getByText("Switched off")).toBeInTheDocument();
    expect(screen.getByText("Shown to buyers")).toBeInTheDocument();
  });

  it("searches by name and shows an empty state", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Dresses and tops" });
    fireEvent.change(screen.getByLabelText("Search charts"), { target: { value: "collar" } });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Dresses and tops" })).toBeNull());
    expect(screen.getByRole("heading", { name: "Shirt collar" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search charts"), { target: { value: "zzz" } });
    expect(await screen.findByText("No chart matches that search.")).toBeInTheDocument();
  });

  it("is read-only without the owner role", async () => {
    mockRole = "reviewer";
    renderPage();
    expect(await screen.findByRole("button", { name: "View Dresses and tops" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chart" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Dresses and tops" })).toBeDisabled();
  });

  it("deletes after a confirmation, and says in words when a chart is still in use", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Delete Dresses and tops" }));
    const dialog = await screen.findByRole("dialog");
    api.deleteSizeChart.mockRejectedValueOnce(apiError("size_chart_in_use"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete chart" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("still uses this chart");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete chart" }));
    await waitFor(() => expect(api.deleteSizeChart).toHaveBeenLastCalledWith("c1"));
    expect(await screen.findByText("Deleted “Dresses and tops”.")).toBeInTheDocument();
  });
});

describe("Size charts: editor", () => {
  it("edits a chart, shows the live preview, converts to inches and saves exactly what changed", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Dresses and tops" }));
    const form = await screen.findByRole("form", { name: /Edit Dresses and tops/ });
    const save = within(form).getByRole("button", { name: "Save chart" });
    expect(save).toBeDisabled();                                                      // nothing changed yet

    fireEvent.change(within(form).getByLabelText("Bust (cm), row 2"), { target: { value: "91" } });
    const preview = within(form).getByTestId("chart-preview");
    expect(within(preview).getByRole("columnheader", { name: "Bust (cm)" })).toBeInTheDocument();
    expect(within(preview).getByText("91")).toBeInTheDocument();                      // live
    expect(within(form).getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText("Unit"), { target: { value: "in" } });
    expect(within(form).getByLabelText("Bust (in), row 2")).toHaveValue("35.8");
    fireEvent.click(save);
    await waitFor(() => expect(api.saveSizeChart).toHaveBeenCalledTimes(1));
    const [id, fields] = api.saveSizeChart.mock.calls[0];
    expect(id).toBe("c1");
    expect(fields).toMatchObject({ name: "Dresses and tops", unit: "in", columns: ["Size", "Bust (in)", "Waist (in)"], product_type_ids: ["dress"] });
    expect(fields.rows[1]).toEqual(["M", "35.8", "28.3"]);
    expect(await screen.findByText("Saved “Dresses and tops”.")).toBeInTheDocument();
  });

  it("creates a chart: blocks an incomplete one with cell-level messages, then saves", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "New chart" }));
    const form = await screen.findByRole("form", { name: "New size chart" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Kids tops" } });
    fireEvent.click(within(form).getByRole("button", { name: "Create chart" }));
    expect(api.saveSizeChart).not.toHaveBeenCalled();
    expect(await within(form).findByText(/Cells marked in red are empty or too long/)).toBeInTheDocument();
    const cell = within(form).getByLabelText("Bust, row 1");
    expect(cell).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(cell.getAttribute("aria-describedby"))).toHaveTextContent("Enter a value.");
    for (const [r, vals] of [[1, ["S", "80", "60"]], [2, ["M", "86", "66"]]]) {
      ["Size", "Bust", "Waist"].forEach((c, i) => fireEvent.change(within(form).getByLabelText(`${c}, row ${r}`), { target: { value: vals[i] } }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Create chart" }));
    await waitFor(() => expect(api.saveSizeChart).toHaveBeenCalledWith(null, expect.objectContaining({ name: "Kids tops", rows: [["S", "80", "60"], ["M", "86", "66"]] })));
  });

  it("pastes a block from a spreadsheet and adds the rows", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Dresses and tops" }));
    const form = await screen.findByRole("form", { name: /Edit/ });
    fireEvent.paste(within(form).getByLabelText("Size, row 2"), { clipboardData: { getData: () => "M\t90\t72\nL\t96\t78\n" } });
    expect(within(form).getByLabelText("Size, row 3")).toHaveValue("L");
    expect(within(form).getByLabelText("Waist (cm), row 3")).toHaveValue("78");
  });

  it("adds and removes rows, moves focus, and keeps the last row", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Dresses and tops" }));
    const form = await screen.findByRole("form", { name: /Edit/ });
    fireEvent.click(within(form).getByRole("button", { name: "Add a row" }));
    await waitFor(() => expect(within(form).getByLabelText("Size, row 3")).toHaveFocus());
    fireEvent.click(within(form).getByRole("button", { name: "Remove row 3" }));
    expect(within(form).queryByLabelText("Size, row 3")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Remove row 2" }));
    expect(within(form).getByRole("button", { name: "Remove row 1" })).toBeDisabled();
  });

  it("says that saving moves types, and shows the database's refusal in words", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit Dresses and tops" }));
    const form = await screen.findByRole("form", { name: /Edit/ });
    fireEvent.click(await within(form).findByRole("checkbox", { name: /Shirt/ }));
    expect(within(form).getByText(/Saving moves Shirt from its current chart to this one/)).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("checkbox", { name: /Dress/ }));
    expect(within(form).getByText(/releases 1 type/)).toBeInTheDocument();
    api.saveSizeChart.mockRejectedValueOnce(apiError("duplicate_chart"));
    fireEvent.click(within(form).getByRole("button", { name: "Save chart" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Another chart already has this name");
  });

  it("has no serious accessibility violations in the list or the editor", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "Dresses and tops" });
    expect(await seriousViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Edit Dresses and tops" }));
    await screen.findByRole("form", { name: /Edit/ });
    fireEvent.click(screen.getByRole("button", { name: "Add a row" }));
    fireEvent.click(screen.getByRole("button", { name: "Save chart" }));
    expect(await seriousViolations(container)).toEqual([]);
  });
});

describe("Size charts: shoe conversion", () => {
  const open = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Shoe conversion" }));
    return screen.findByRole("form", { name: "Shoe conversion table" });
  };

  it("shows the table, its version, a preview and a try-a-size converter", async () => {
    const form = await open();
    expect(within(form).getByText(/version 4/)).toBeInTheDocument();
    expect(within(form).getByLabelText("EU, row 1")).toBeInTheDocument();
    expect(within(within(form).getByTestId("shoe-preview")).getAllByRole("row").length).toBeGreaterThan(5);
    expect(within(form).getByText("EU 42")).toBeInTheDocument();                      // try a size, default input
    fireEvent.change(within(form).getByLabelText("Try a size"), { target: { value: "UK 8" } });
    expect(within(form).getByText("EU 42")).toBeInTheDocument();
  });

  it("marks a row that breaks the rules, blocks the save, and saves a good edit", async () => {
    const form = await open();
    const eu = within(form).getByLabelText("EU, row 4");
    const before = eu.value;
    fireEvent.change(eu, { target: { value: "30" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save table" }));
    expect(api.saveShoeConversion).not.toHaveBeenCalled();
    expect(await within(form).findByText(/must be larger than the row above|EU must be/)).toBeInTheDocument();
    expect(within(form).getByText(/The table has problems, so this shows the last saved version/)).toBeInTheDocument();
    fireEvent.change(eu, { target: { value: before } });
    fireEvent.change(within(form).getByLabelText("Foot length (cm), row 1"), { target: { value: String(Number(within(form).getByLabelText("Foot length (cm), row 1").value) - 0.1) } });
    fireEvent.click(within(form).getByRole("button", { name: "Save table" }));
    await waitFor(() => expect(api.saveShoeConversion).toHaveBeenCalledTimes(1));
    expect(Object.keys(api.saveShoeConversion.mock.calls[0][0]).sort()).toEqual(["adult", "kids"]);
    expect(await screen.findByText("Shoe table saved (version 5).")).toBeInTheDocument();
  });

  it("resets to the default table only after a confirmation", async () => {
    const form = await open();
    fireEvent.change(within(form).getByLabelText("EU, row 1"), { target: { value: "35" } });
    fireEvent.click(within(form).getByRole("button", { name: "Reset to the default table" }));
    expect(within(form).getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(within(form).getByRole("button", { name: "Replace the rows" }));
    expect(within(form).getByLabelText("EU, row 1")).toHaveValue(String(scales.SHOE_CHART.adult[0].eu));
  });

  it("switches to kids rows, which need only EU and foot length", async () => {
    const form = await open();
    fireEvent.click(within(within(form).getByRole("radiogroup", { name: "Table" })).getByRole("radio", { name: "Kids" }));
    expect(within(form).queryByLabelText("UK, row 1")).toBeNull();
    expect(within(form).getByLabelText("EU, row 1")).toBeInTheDocument();
  });
});

describe("seed data", () => {
  it("the mock library starts from the same charts the database seeds", () => {
    expect(SEED_SIZE_CHARTS.length).toBeGreaterThanOrEqual(5);
  });
});
