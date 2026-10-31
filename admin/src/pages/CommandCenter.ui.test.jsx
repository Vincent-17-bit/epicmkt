import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
let mockCounts;
const refetch = vi.fn();
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole } }) }));
vi.mock("../hooks/useAdminCounts.js", () => ({ useAdminCounts: () => mockCounts }));
vi.mock("../components/LiveActivityPanel.jsx", () => ({ default: () => <div>Activity stub</div>, ACTIVITY_KEY: ["admin-activity"] }));
const api = { getAnalytics: vi.fn() };
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: CommandCenterPage } = await import("./CommandCenterPage.jsx");

const COUNTS = {
  liveBusinesses: 38, applicationsWaiting: 5, applicationsOver24h: 2, unconfirmedPayments: 3,
  firstPaymentsToConfirm: 1, renewalPaymentsToConfirm: 2, openFlags: 0, openReports: 0, failedMessages: 0,
  expiringSoon: 6, inGrace: 1,
};
const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes><Route path="*" element={<><CommandCenterPage /><Where /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  mockRole = "owner";
  mockCounts = { data: COUNTS, isPending: false, isError: false, error: null, refetch, isFetching: false };
  api.getAnalytics.mockReset();
  api.getAnalytics.mockResolvedValue({
    can_see_money: true,
    new_businesses_by_day: Array.from({ length: 14 }, (_, i) => ({ day: `d${i}`, n: i % 4 === 0 ? 1 : 0 })),
    revenue_by_day: Array.from({ length: 14 }, (_, i) => ({ day: `d${i}`, kes: i * 100 })),
  });
});
afterEach(cleanup);

describe("Command Center", () => {
  it("leads with what needs attention, busiest first, with real notes", () => {
    mount();
    const panel = screen.getByRole("region", { name: "Needs attention" });
    expect(within(panel).getByText("8")).toBeInTheDocument(); // 5 applications + 3 payments
    const links = within(panel).getAllByRole("link").map((a) => a.textContent);
    expect(links[0]).toMatch(/Applications waiting.*2 waiting over 24 hours.*5/);
    expect(links[1]).toMatch(/Payments to confirm.*1 new seller and 2 renewals.*3/);
    expect(within(panel).getByText(/Nothing waiting: open flags, failed messages/)).toBeInTheDocument();
  });

  it("Send broadcast goes to the broadcasts page", () => {
    mount();
    fireEvent.click(screen.getByRole("link", { name: "Send broadcast" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/broadcasts");
  });

  it("only offers actions the role may use", () => {
    mockRole = "finance";
    mount();
    expect(screen.getByRole("link", { name: "Confirm payments" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Send broadcast" })).not.toBeInTheDocument();
  });

  it("draws trend lines only from real analytics data", async () => {
    mount();
    expect(await screen.findByRole("img", { name: /New businesses per day/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Revenue per day/ })).toBeInTheDocument();
    expect(screen.getByText("4 new in 14 days")).toBeInTheDocument();
  });

  it("shows no trend lines or revenue card when analytics is unavailable", async () => {
    api.getAnalytics.mockRejectedValue(new Error("boom"));
    mount();
    await screen.findByText("Live businesses");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Revenue/)).not.toBeInTheDocument();
  });

  it("says so when nothing is waiting", () => {
    mockCounts = { ...mockCounts, data: { ...COUNTS, applicationsWaiting: 0, unconfirmedPayments: 0, applicationsOver24h: 0 } };
    mount();
    expect(screen.getByText("You’re all caught up")).toBeInTheDocument();
  });

  it("shows a loading state, never made-up zeros", () => {
    mockCounts = { data: undefined, isPending: true, isError: false, error: null, refetch, isFetching: true };
    mount();
    expect(screen.getByText("Loading what needs attention")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows an error card with a working Try again when there is no data", () => {
    mockCounts = { data: undefined, isPending: false, isError: true, error: new Error("Failed to fetch"), refetch, isFetching: false };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load the numbers");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalled();
  });
});
