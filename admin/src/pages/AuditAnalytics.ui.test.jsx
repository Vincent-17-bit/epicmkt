import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: "owner" }, status: "admin", demo: false }) }));

const api = { listAudit: vi.fn(), getAuditGroups: vi.fn(async () => [{ group: "item", n: 2 }, { group: "plan", n: 1 }]), getAnalytics: vi.fn() };
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: AuditPage } = await import("./AuditPage.jsx");
const { default: AnalyticsPage } = await import("./AnalyticsPage.jsx");

const renderPage = (el) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>,
);

const analytics = (over = {}) => ({
  days: 30, from: "2026-09-22", to: "2026-10-21", can_see_money: true, can_see_applications: true,
  revenue_by_day: [{ day: "2026-10-20", kes: 500, payments: 1 }, { day: "2026-10-21", kes: 1300, payments: 1 }], revenue_total: 1800, mrr_kes: 41800,
  new_businesses_by_day: [{ day: "2026-10-20", n: 0 }, { day: "2026-10-21", n: 2 }],
  businesses: { live: 38, expired: 5, suspended: 1, premium_live: 11 }, funnel: { submitted: 40, approved: 30, activated: 24, rejected: 6 },
  by_category: [{ id: "bakery", name: "Bakery", live: 14, monthly_kes: 12400 }], renewals: { due: 20, renewed: 16 }, ...over,
});

beforeEach(() => {
  api.listAudit.mockResolvedValue({ total: 1, rows: [{ id: 1, created_at: "2026-10-20T08:00:00Z", action: "plan.update", actor_email: "owner@test", actor_role: "admin", target_type: "plan", target_id: "bakery:standard", reason: "Inflation", before: { price_kes: 400 }, after: { price_kes: 500 }, business_id: null }] });
  api.getAnalytics.mockResolvedValue(analytics());
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Audit log", () => {
  it("shows readable actions and expands to what changed", async () => {
    renderPage(<AuditPage />);
    expect(await screen.findByText("Changed a plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show changes for Changed a plan" }));
    const diff = within(await screen.findByRole("table", { name: "Changes" }));
    expect(diff.getByText("price_kes")).toBeInTheDocument();
    expect(diff.getByText("400")).toBeInTheDocument();
    expect(diff.getByText("500")).toBeInTheDocument();
  });

  it("filters ask the database and can be cleared", async () => {
    renderPage(<AuditPage />);
    await screen.findByText("Changed a plan");
    fireEvent.change(screen.getByLabelText("Who"), { target: { value: "owner" } });
    await waitFor(() => expect(api.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: "owner", page: 0 })));
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(api.listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ actor: "", search: "" })));
  });

  it("says plainly when nothing matches, and when it cannot load", async () => {
    api.listAudit.mockResolvedValueOnce({ total: 0, rows: [] });
    renderPage(<AuditPage />);
    expect(await screen.findByText("Nothing matches these filters.")).toBeInTheDocument();
    cleanup();
    api.listAudit.mockRejectedValueOnce(new Error("boom"));
    renderPage(<AuditPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the audit log/i);
  });
});

describe("Analytics", () => {
  it("shows money, growth, the funnel and categories", async () => {
    renderPage(<AnalyticsPage />);
    expect(await screen.findByText("KES 1,800")).toBeInTheDocument();
    expect(screen.getByText("KES 41,800")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument(); // 16 of 20 renewed
    expect(screen.getByRole("img", { name: /Revenue per day: KES 1,800 in total, busiest day KES 1,300/ })).toBeInTheDocument();
    expect(screen.getByText("75% of submitted · 75% of the step before")).toBeInTheDocument();
    expect(screen.getByText("Bakery")).toBeInTheDocument();
  });

  it("hides money for roles that may not see it", async () => {
    api.getAnalytics.mockResolvedValue(analytics({ can_see_money: false, revenue_by_day: [], revenue_total: null, mrr_kes: null, renewals: {}, by_category: [{ id: "bakery", name: "Bakery", live: 14, monthly_kes: 0 }] }));
    renderPage(<AnalyticsPage />);
    expect(await screen.findByText("Live businesses")).toBeInTheDocument();
    expect(screen.queryByText(/Revenue, 30 days/)).not.toBeInTheDocument();
    expect(screen.queryByText("Monthly value")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Revenue/ })).not.toBeInTheDocument();
  });

  it("changing the period asks again; an empty funnel says so", async () => {
    api.getAnalytics.mockResolvedValue(analytics({ funnel: { submitted: 0, approved: 0, activated: 0, rejected: 0 } }));
    renderPage(<AnalyticsPage />);
    expect(await screen.findByText("No applications in this period.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "90" } });
    await waitFor(() => expect(api.getAnalytics).toHaveBeenCalledWith({ days: 90 }));
  });
});
