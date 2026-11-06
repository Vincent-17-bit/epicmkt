import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "reviewer";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const val = (over = {}) => ({ id: "v1", kind: "material", label: "Mahogany veneer", key: "mahogany veneer", status: "pending", hex: null, tags: [], uses: 2, mergedInto: null, createdAt: "2026-11-01T00:00:00Z", reviewedAt: null, ...over });
const api = {
  listOptionValues: vi.fn(), approveOptionValue: vi.fn(async (id) => val({ id, status: "approved" })), updateOptionValue: vi.fn(async () => val()),
  renameOptionValue: vi.fn(async (id, label) => val({ id, label, itemsUpdated: 2 })), mergeOptionValue: vi.fn(async () => val({ id: "v2", label: "Mahogany", itemsUpdated: 2 })),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: OpenValuesPage } = await import("./OpenValuesPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><OpenValuesPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  mockRole = "reviewer";
  api.listOptionValues.mockImplementation(async ({ status, kind, query }) => {
    const all = [val(), val({ id: "v2", label: "Mahogany", key: "mahogany", status: "approved", uses: 5, tags: ["wood"] }), val({ id: "v3", kind: "color", label: "Wine red", status: "pending", hex: "#7b1e3a", uses: 0 })];
    const values = all.filter((v) => (!status || v.status === status) && (!kind || v.kind === kind) && (!query || v.key.includes(query.toLowerCase())));
    return { total: values.length, values };
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Open values review", () => {
  it("opens on the values waiting for review, with item counts and a shade swatch", async () => {
    renderPage();
    expect(await screen.findByText("Mahogany veneer")).toBeInTheDocument();
    expect(api.listOptionValues).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", kind: null, offset: 0 }));
    expect(screen.queryByText("Mahogany")).toBeNull();                       // approved values are on another tab
    expect(screen.getByRole("img", { name: "Shade #7b1e3a" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Waiting for review" })).toHaveAttribute("aria-selected", "true");
  });

  it("switching tabs and filters asks the database for that slice", async () => {
    renderPage();
    await screen.findByText("Mahogany veneer");
    fireEvent.click(screen.getByRole("tab", { name: "Approved" }));
    expect(await screen.findByText("Mahogany")).toBeInTheDocument();
    expect(api.listOptionValues).toHaveBeenLastCalledWith(expect.objectContaining({ status: "approved" }));
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "color" } });
    await waitFor(() => expect(api.listOptionValues).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "color" })));
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(api.listOptionValues).toHaveBeenLastCalledWith(expect.objectContaining({ status: null })));
  });

  it("approves with one click", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Approve Mahogany veneer" }));
    await waitFor(() => expect(api.approveOptionValue).toHaveBeenCalledWith("v1"));
    expect(await screen.findByText("Approved “Mahogany veneer”.")).toBeInTheDocument();
  });

  it("renames, says how many items follow, and shows the database's refusal in words", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Rename Mahogany veneer" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/2 items use this value and will show the new spelling/)).toBeInTheDocument();
    const save = within(dialog).getByRole("button", { name: "Rename" });
    expect(save).toBeDisabled();                                               // unchanged
    fireEvent.change(within(dialog).getByLabelText("New spelling"), { target: { value: "Mahogany" } });
    api.renameOptionValue.mockRejectedValueOnce(Object.assign(new Error("value_exists"), { code: "value_exists" }));
    fireEvent.click(save);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Merge this value into it instead");
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(api.renameOptionValue).toHaveBeenLastCalledWith("v1", "Mahogany"));
    expect(await screen.findByText("Renamed. 2 items now show “Mahogany”.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("merges into a chosen value of the same kind, after saying what will happen", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Merge Mahogany veneer" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("radio", { name: /Mahogany/ });
    expect(api.listOptionValues).toHaveBeenCalledWith(expect.objectContaining({ kind: "material" }));
    expect(within(dialog).queryByRole("radio", { name: /Wine red/ })).toBeNull();           // other kinds are not offered
    expect(within(dialog).queryByRole("radio", { name: /Mahogany veneer/ })).toBeNull();    // not itself
    const merge = within(dialog).getByRole("button", { name: "Merge" });
    expect(merge).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Mahogany · approved/ }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("“Mahogany veneer” (2 items) will become “Mahogany”. This cannot be undone.");
    fireEvent.click(merge);
    await waitFor(() => expect(api.mergeOptionValue).toHaveBeenCalledWith("v1", "v2"));
    expect(await screen.findByText("Merged into “Mahogany”. 2 items updated.")).toBeInTheDocument();
  });

  it("edits tags and, for a colour, the shade", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit tags and shade of Wine red" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Tags/), { target: { value: " Dark , red ,, " } });
    fireEvent.change(within(dialog).getByLabelText(/Shade/), { target: { value: "#7B1E3A" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateOptionValue).toHaveBeenCalledWith("v3", { tags: ["Dark", "red"], hex: "#7B1E3A" }));
  });

  it("a material has no shade field", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Edit tags and shade of Mahogany veneer" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByLabelText(/Shade/)).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateOptionValue).toHaveBeenCalledWith("v1", { tags: [] }));
  });

  it("other roles can read the list but every action is disabled and explains why", async () => {
    mockRole = "finance";
    renderPage();
    const approve = await screen.findByRole("button", { name: "Approve Mahogany veneer" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("title", expect.stringContaining("Only Owners and Reviewers"));
    expect(screen.getByRole("button", { name: "Rename Mahogany veneer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Merge Mahogany veneer" })).toBeDisabled();
  });

  it("shows a retryable error when the list cannot load", async () => {
    api.listOptionValues.mockRejectedValueOnce(new Error("down"));
    renderPage();
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });

  it("says so when nothing is waiting", async () => {
    api.listOptionValues.mockResolvedValue({ total: 0, values: [] });
    renderPage();
    expect(await screen.findByText("Nothing is waiting for review.")).toBeInTheDocument();
  });
});
