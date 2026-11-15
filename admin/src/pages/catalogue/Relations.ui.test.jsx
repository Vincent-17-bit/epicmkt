import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import * as mock from "../../api/mockRelations.js";

let mockRole = "owner";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));
const api = { listRelations: vi.fn(mock.listRelations), saveRelation: vi.fn(mock.saveRelation), deleteRelation: vi.fn(mock.deleteRelation) };
vi.mock("../../api/index.js", () => ({ api, default: api }));
const { default: RelationsPage } = await import("./RelationsPage.jsx");

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><RelationsPage /></MemoryRouter></QueryClientProvider>);
beforeEach(() => { mockRole = "owner"; });
afterEach(() => { cleanup(); mock.resetRelationsMock(); Object.values(api).forEach((f) => f.mockClear()); });

describe("Relations", () => {
  it("lists the pairs with their strength and whether they are on", async () => {
    renderPage();
    const row = (await screen.findByText("Phone (type)")).closest("tr");
    expect(within(row).getByText("Phone case (type)")).toBeInTheDocument();
    expect(within(row).getByLabelText("Strength, Phone to Phone case")).toHaveValue(8);
    expect(within(row).getByRole("checkbox")).toBeChecked();
  });

  it("adds a relation", async () => {
    renderPage();
    await screen.findByText("Phone (type)");
    fireEvent.change(screen.getByLabelText("When viewing name"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByLabelText("Also show name"), { target: { value: "rug" } });
    fireEvent.click(screen.getByRole("button", { name: "Add relation" }));
    await waitFor(() => expect(api.saveRelation).toHaveBeenCalledWith(expect.objectContaining({ fromKind: "type", fromId: "sofa", toKind: "type", toId: "rug", weight: 5, active: true })));
    expect(await screen.findByText("Relation added.")).toBeInTheDocument();
    expect(await screen.findByText("Sofa (type)")).toBeInTheDocument();
  });

  it("explains a pair that points at itself", async () => {
    renderPage();
    await screen.findByText("Phone (type)");
    fireEvent.change(screen.getByLabelText("When viewing name"), { target: { value: "sofa" } });
    fireEvent.change(screen.getByLabelText("Also show name"), { target: { value: "sofa" } });
    fireEvent.click(screen.getByRole("button", { name: "Add relation" }));
    expect(await screen.findByText(/Pick two different things/)).toBeInTheDocument();
  });

  it("switches a relation off, changes a strength and removes one", async () => {
    renderPage();
    const row = (await screen.findByText("Phone (type)")).closest("tr");
    fireEvent.click(within(row).getByRole("checkbox"));
    await waitFor(() => expect(api.saveRelation).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", active: false })));
    fireEvent.change(await screen.findByLabelText("Strength, Phone to Phone case"), { target: { value: "3" } });
    const again = (await screen.findByText("Phone (type)")).closest("tr");
    fireEvent.change(within(again).getByLabelText("Strength, Phone to Phone case"), { target: { value: "3" } });
    fireEvent.click(within(again).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveRelation).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", weight: 3 })));
  });

  it("removes a relation", async () => {
    renderPage();
    await screen.findByText("Phone (type)");
    fireEvent.click(screen.getByRole("button", { name: "Remove Phone to Phone case" }));
    await waitFor(() => expect(api.deleteRelation).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.queryByText("Phone (type)")).toBeNull());
  });

  it("is read only for a reviewer", async () => {
    mockRole = "reviewer";
    renderPage();
    await screen.findByText("Phone (type)");
    expect(screen.queryByRole("form", { name: "Add a relation" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Phone to Phone case" })).toBeDisabled();
  });

  it("has no serious accessibility problems", async () => {
    const { container } = renderPage();
    await screen.findByText("Phone (type)");
    const r = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});
