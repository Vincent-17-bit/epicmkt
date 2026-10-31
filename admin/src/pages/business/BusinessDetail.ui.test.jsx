import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const business = (over = {}) => ({
  business: {
    id: "b1", seller_id: "ES100210", slug: "lakeside", name: "Lakeside Provisions", category_id: "grocery", category_name: "Grocery", plan_key: "premium",
    status: "live", status_reason: null, verification_level: "verified", featured: false, paid_until: "2099-01-01", first_paid_at: "2026-01-01", monthly_price: 1300,
    credit_kes: 0, strikes: 1, tags: ["vip"], owner_name: "Alice Njeri", phone: "+254700000001", whatsapp: null, email: "a@shop.test", county: "Kisumu", town: "Kisumu",
    address: null, last_login_at: null, last_edit_at: null, deleted_at: null, created_at: "2026-01-01T00:00:00Z", ...over,
  },
  stats: { items: 2, items_hidden: 1, open_flags: 1, open_reports: 0, paid_total_kes: 2600, payments_waiting: 0, last_payment_at: null },
});

const api = {
  getBusinessDetail: vi.fn(),
  getLoginDelivery: vi.fn(async () => []),
  resendLogin: vi.fn(async () => ({ ok: true })),
  getBusinessPayments: vi.fn(async () => [{ id: "p1", created_at: "2026-02-01T00:00:00Z", amount_kes: 1300, status: "confirmed", kind: "renewal", mpesa_code: "SGH4K9L2QW", receipt_no: "R-1", period_end: "2026-03-01", months: 1 }]),
  getBusinessItems: vi.fn(async () => [
    { id: "i1", name: "Chocolate cake", section: "Cakes", price: 1800, price_type: "fixed", visible: true, draft: false, hidden_by_admin: false },
    { id: "i2", name: "Old bread", section: "Bakes", price: 60, price_type: "fixed", visible: true, draft: false, hidden_by_admin: true, admin_hide_reason: "Out of date photo" },
  ]),
  getBusinessFlags: vi.fn(async () => ({ flags: [{ id: "f1", reason: "Photo does not match", status: "open", created_at: "2026-02-01T00:00:00Z", item_name: "Chocolate cake" }], reports: [] })),
  getBusinessActivity: vi.fn(async () => [{ id: 1, action: "item.hide", actor_email: "reviewer@test", created_at: "2026-02-01T00:00:00Z", reason: "Misleading" }]),
  getBusinessNotes: vi.fn(async () => []),
  getBusinessFilterOptions: vi.fn(async () => ({ categories: [], counties: [], towns: [], agents: [], tags: [] })),
  setBusinessVisibility: vi.fn(async () => true),
  setItemHidden: vi.fn(async () => true),
  setFlagStatus: vi.fn(async () => true),
  addBusinessNote: vi.fn(async () => "n1"),
  setBusinessNotePinned: vi.fn(async () => true),
  deleteBusinessNote: vi.fn(async () => true),
  bulkBusinessAction: vi.fn(async () => ({ affected: 1, total: 1 })),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: BusinessDetailPage } = await import("./BusinessDetailPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

function renderPage(path = "/admin/businesses/b1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route path="/admin/businesses" element={<p>the list</p>} />
            <Route path="/admin/businesses/:id" element={<BusinessDetailPage />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRole = "owner";
  Object.values(api).forEach((fn) => fn.mockClear?.());
  api.getBusinessDetail.mockImplementation(async () => business());
  api.getLoginDelivery.mockImplementation(async () => []);
});
afterEach(cleanup);

const tabNames = () => screen.getAllByRole("tab").map((t) => t.textContent);

describe("business detail page", () => {
  it("shows the business, its status and the overview", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Lakeside Provisions" })).toBeInTheDocument();
    expect(screen.getByText("Alice Njeri")).toBeInTheDocument();
    expect(screen.getByText("KES 2,600")).toBeInTheDocument();
    expect(screen.getByText("1 strike")).toBeInTheDocument();
    expect(tabNames()).toEqual(["Overview", "Payments", "Items", "Flags and reports", "Activity", "Notes"]);
  });

  it("finance does not get the Items or Flags tabs, and a deep link to one falls back to Overview", async () => {
    mockRole = "finance";
    renderPage("/admin/businesses/b1?tab=items");
    await screen.findByRole("heading", { name: "Lakeside Provisions" });
    expect(tabNames()).toEqual(["Overview", "Payments", "Activity", "Notes"]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(api.getBusinessItems).not.toHaveBeenCalled();
  });

  it("an unknown business says so and offers the way back", async () => {
    api.getBusinessDetail.mockImplementation(async () => { throw Object.assign(new Error("not_found"), { code: "not_found" }); });
    renderPage();
    expect(await screen.findByText("Business not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to businesses" }));
    expect(await screen.findByText("the list")).toBeInTheDocument();
  });

  it("hiding the business needs a reason and calls the database with it", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Hide from customers" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Hide from customers" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Owner asked us to" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(api.setBusinessVisibility).toHaveBeenCalledWith({ id: "b1", visible: false, reason: "Owner asked us to" }));
  });

  it("a paused business offers to show it again", async () => {
    api.getBusinessDetail.mockImplementation(async () => business({ status: "paused" }));
    renderPage();
    expect(await screen.findByRole("button", { name: "Show to customers" })).toBeEnabled();
  });

  it("a suspended business cannot be hidden or shown", async () => {
    api.getBusinessDetail.mockImplementation(async () => business({ status: "suspended" }));
    renderPage();
    await screen.findByRole("heading", { name: "Lakeside Provisions" });
    expect(screen.queryByRole("button", { name: /customers/ })).not.toBeInTheDocument();
  });

  it("finance sees the button disabled with the reason; the extend action is theirs alone", async () => {
    mockRole = "finance";
    renderPage();
    const hide = await screen.findByRole("button", { name: "Hide from customers" });
    expect(hide).toBeDisabled();
    expect(hide).toHaveAttribute("title", expect.stringContaining("Only Owners, Reviewers and Support admins can hide or show a business"));
    const options = within(screen.getByLabelText("More actions")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toHaveLength(2); // the placeholder and Extend
  });

  it("items: hide one with a reason, show a hidden one straight away", async () => {
    renderPage("/admin/businesses/b1?tab=items");
    const row = (await screen.findByText("Chocolate cake")).closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Hide" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Misleading photo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide item" }));
    await waitFor(() => expect(api.setItemHidden).toHaveBeenCalledWith({ id: "i1", hidden: true, reason: "Misleading photo" }));

    const hiddenRow = screen.getByText("Old bread").closest("tr");
    expect(within(hiddenRow).getByText("Out of date photo")).toBeInTheDocument();
    fireEvent.click(within(hiddenRow).getByRole("button", { name: "Show again" }));
    await waitFor(() => expect(api.setItemHidden).toHaveBeenCalledWith({ id: "i2", hidden: false, reason: undefined }));
  });

  it("a refused item action shows a sentence, not a code", async () => {
    api.setItemHidden.mockImplementationOnce(async () => { throw Object.assign(new Error("forbidden"), { code: "forbidden" }); });
    renderPage("/admin/businesses/b1?tab=items");
    const row = (await screen.findByText("Chocolate cake")).closest("tr");
    fireEvent.click(within(row).getByRole("button", { name: "Hide" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Misleading photo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide item" }));
    expect(await screen.findByText("Your role cannot do this.")).toBeInTheDocument();
  });

  it("flags can be resolved", async () => {
    renderPage("/admin/businesses/b1?tab=flags");
    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(api.setFlagStatus).toHaveBeenCalledWith({ id: "f1", status: "resolved" }));
  });

  it("activity reads in plain words", async () => {
    renderPage("/admin/businesses/b1?tab=activity");
    expect(await screen.findByText("Hid an item")).toBeInTheDocument();
    expect(screen.getByText(/reviewer@test/)).toBeInTheDocument();
  });

  it("notes: add one, with the pin option", async () => {
    renderPage("/admin/businesses/b1?tab=notes");
    const add = await screen.findByRole("button", { name: "Add note" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Add a note/), { target: { value: "Called about renewal" } });
    fireEvent.click(screen.getByLabelText("Pin to the top"));
    fireEvent.click(add);
    await waitFor(() => expect(api.addBusinessNote).toHaveBeenCalledWith({ id: "b1", body: "Called about renewal", pinned: true }));
  });

  it("shows which login channel failed and resends with a reason", async () => {
    api.getLoginDelivery.mockImplementation(async () => [
      { channel: "sms", status: "sent", created_at: "2026-02-01T00:00:00Z" },
      { channel: "email", status: "failed", created_at: "2026-02-01T00:00:00Z" },
    ]);
    renderPage();
    expect(await screen.findByText("Login sent: SMS ok / email failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resend login" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Resend login" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Email bounced" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.resendLogin).toHaveBeenCalledWith({ businessId: "b1", reason: "Email bounced" }));
    await waitFor(() => expect(api.getLoginDelivery).toHaveBeenCalledTimes(2));
  });

  it("only the owner can resend; others see the button disabled", async () => {
    mockRole = "support";
    renderPage();
    const resend = await screen.findByRole("button", { name: "Resend login" });
    expect(resend).toBeDisabled();
    expect(api.getLoginDelivery).toHaveBeenCalled();
  });

  it("a business with no recorded login send says so", async () => {
    renderPage();
    expect(await screen.findByText("Login not sent yet")).toBeInTheDocument();
  });

  it("finance, who cannot read messages, does not see the login status", async () => {
    mockRole = "finance";
    renderPage();
    await screen.findByRole("heading", { name: "Lakeside Provisions" });
    expect(screen.queryByRole("button", { name: "Resend login" })).not.toBeInTheDocument();
    expect(api.getLoginDelivery).not.toHaveBeenCalled();
  });
});
