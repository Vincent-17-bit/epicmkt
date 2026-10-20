import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const change = (over = {}) => ({
  id: "c1", business_id: "b1", business_name: "Fade Kings", field: "phone", old_value: "+254712000111", new_value: "+254733000222", status: "pending",
  created_at: "2026-10-20T08:00:00Z", extra_due_kes: 0, new_monthly_price: null, applies_from_next_renewal: true, ...over,
});

const api = {
  getModerationCounts: vi.fn(async () => ({ flags_open: 1, flags_replied: 0, flags_overdue: 1, reports_open: 2, items_hidden: 0 })),
  listFlags: vi.fn(),
  listReports: vi.fn(),
  listCatalog: vi.fn(),
  setModerationFlag: vi.fn(async () => true),
  setReportStatus: vi.fn(async () => true),
  bulkSetItemsHidden: vi.fn(async () => 1),
  raiseFlag: vi.fn(async () => "f9"),
  listChangeRequests: vi.fn(),
  decideChangeRequest: vi.fn(async () => true),
  getExpiryRadar: vi.fn(),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: ModerationPage } = await import("./ModerationPage.jsx");
const { default: ApprovalsPage } = await import("./ApprovalsPage.jsx");
const { default: ExpiryRadarPage } = await import("./ExpiryRadarPage.jsx");
const { ToastProvider } = await import("../components/Toast.jsx");

function renderPage(element, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ToastProvider>{element}</ToastProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockRole = "owner";
  api.listFlags.mockResolvedValue({ total: 1, rows: [{ id: "f1", business_id: "b1", business_name: "Lakeside Provisions", item_name: "Dairy meal", reason: "Photo does not match", status: "open", seller_message: "Wrong brand shown", seller_reply: null, due_at: "2026-10-01T00:00:00Z", created_at: "2026-09-25T00:00:00Z", overdue: true }] });
  api.listReports.mockResolvedValue({ total: 1, rows: [{ id: "r1", business_id: "b1", business_name: "Lakeside Provisions", item_name: null, reason: "wrong_price", details: "Cheaper next door", status: "open", created_at: "2026-10-19T00:00:00Z", open_for_business: 2 }] });
  api.listCatalog.mockResolvedValue({ total: 1, rows: [{ id: "i1", name: "Dairy meal", section: "Feeds", price: 2600, sale_price: null, visible: true, draft: false, hidden_by_admin: false, business_id: "b1", business_name: "Lakeside Provisions", open_flags: 1, open_reports: 0 }] });
  api.listChangeRequests.mockResolvedValue({ total: 2, rows: [change(), change({ id: "c2", field: "category_id", old_value: "bakery", new_value: "restaurant", old_label: "Bakery", new_label: "Restaurant", extra_due_kes: 650, new_monthly_price: 1500 })] });
  api.getExpiryRadar.mockResolvedValue([
    { id: "b1", name: "Lakeside Provisions", plan_key: "premium", phone: "0712345678", monthly_price: 1500, paid_until: "2026-10-26T00:00:00Z", days_left: 5, state: "active", last_reminder_at: null, payment_waiting: false },
    { id: "b2", name: "Pwani Pastries", plan_key: "standard", phone: "0700123456", monthly_price: 500, paid_until: "2026-10-17T00:00:00Z", days_left: -4, state: "expired", last_reminder_at: "2026-10-18T00:00:00Z", payment_waiting: true },
  ]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Moderation", () => {
  it("shows flags with the overdue warning and resolves one", async () => {
    renderPage(<ModerationPage />);
    expect(await screen.findByText("Photo does not match")).toBeInTheDocument();
    expect(screen.getByText(/Overdue by/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resolve flag for Lakeside Provisions/ }));
    await waitFor(() => expect(api.setModerationFlag).toHaveBeenCalledWith({ id: "f1", status: "resolved" }));
  });

  it("dismisses a report from the Reports tab", async () => {
    renderPage(<ModerationPage />, "/?tab=reports");
    expect(await screen.findByText("Wrong price")).toBeInTheDocument();
    expect(screen.getByText("2 open reports")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Dismiss report on Lakeside Provisions/ }));
    await waitFor(() => expect(api.setReportStatus).toHaveBeenCalledWith({ id: "r1", status: "dismissed" }));
  });

  it("hides an item only after a reason is given", async () => {
    renderPage(<ModerationPage />, "/?tab=catalogue");
    fireEvent.click(await screen.findByRole("button", { name: "Hide Dairy meal" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Hide" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Photo shows another brand" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.bulkSetItemsHidden).toHaveBeenCalledWith({ ids: ["i1"], hidden: true, reason: "Photo shows another brand" }));
  });

  it("support can act; finance never reaches this page's buttons enabled", async () => {
    mockRole = "finance";
    renderPage(<ModerationPage />);
    const button = await screen.findByRole("button", { name: /Resolve flag for Lakeside Provisions/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("Only"));
  });
});

describe("Approvals", () => {
  it("lists waiting changes with category names and the money consequence", async () => {
    renderPage(<ApprovalsPage />);
    expect(await screen.findByText("+254733000222")).toBeInTheDocument();
    expect(screen.getByText("Bakery")).toBeInTheDocument();
    expect(screen.getByText("Restaurant")).toBeInTheDocument();
    expect(screen.getByText(/The seller owes KES 650 now/)).toBeInTheDocument();
  });

  it("approves after a confirmation step", async () => {
    renderPage(<ApprovalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Approve Phone number change for Fade Kings/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(api.decideChangeRequest).toHaveBeenCalledWith({ id: "c1", approve: true, note: undefined }));
  });

  it("rejecting needs a reason that goes to the seller", async () => {
    renderPage(<ApprovalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Reject Phone number change for Fade Kings/ }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Number does not match your licence" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(api.decideChangeRequest).toHaveBeenCalledWith({ id: "c1", approve: false, note: "Number does not match your licence" }));
  });

  it("shows the database's own words when a request was already decided", async () => {
    api.decideChangeRequest.mockRejectedValueOnce(Object.assign(new Error("Someone has already decided this request. Reload to see the result."), { code: "already_decided" }));
    renderPage(<ApprovalsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Approve Phone number change for Fade Kings/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/already decided/);
  });

  it("an unreachable list shows an error with a retry", async () => {
    api.listChangeRequests.mockRejectedValueOnce(new Error("boom"));
    renderPage(<ApprovalsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load change requests/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("Expiry Radar", () => {
  it("groups listings, totals the money still to collect and offers WhatsApp", async () => {
    renderPage(<ExpiryRadarPage />);
    expect(await screen.findByRole("link", { name: "Lakeside Provisions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Lapsed/ })).toBeInTheDocument();
    expect(screen.getByText("Lapsed 4 days ago")).toBeInTheDocument();
    expect(screen.getByText("5 days left")).toBeInTheDocument();
    expect(screen.getByText("Waiting to confirm")).toBeInTheDocument();
    expect(screen.getByText("KES 1,500")).toBeInTheDocument(); // Pwani's payment is already waiting, so only Lakeside is at risk
    expect(screen.getByRole("link", { name: "Message Lakeside Provisions on WhatsApp" })).toHaveAttribute("href", expect.stringContaining("https://wa.me/254712345678"));
  });

  it("changing the window asks the database again", async () => {
    renderPage(<ExpiryRadarPage />);
    await screen.findByRole("link", { name: "Lakeside Provisions" });
    fireEvent.change(screen.getByLabelText("Look ahead"), { target: { value: "7" } });
    await waitFor(() => expect(api.getExpiryRadar).toHaveBeenCalledWith({ days: 7 }));
  });
});
