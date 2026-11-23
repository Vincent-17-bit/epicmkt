import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seriousViolations } from "../../test/axe.js";

const push = vi.fn();
let canManage = true;
const overview = (extra = {}) => ({
  status: { ok: true, computedAt: "2026-11-16T09:12:00Z", ageMinutes: 30, staleAfterHours: 5, minPeople: 3 },
  popular: [
    { rank: 1, term: "gas cylinder", kind: "product", name: "Gas Cylinder 6kg", people: 41, hot: true },
    { rank: 2, term: "mama njeri bakery", kind: "store", name: "Mama Njeri Bakery", people: 33, hot: false },
    { rank: 3, term: "flash sneakers", kind: "flash", name: "Flash Sneakers", people: 27, hot: false },
    { rank: 4, term: "barber", kind: "category", name: "Barber", people: 19, hot: false }
  ],
  rising: [{ rank: 1, term: "solar lamp", kind: "product", name: "Solar Lamp", people: 14, ratio: 7 }],
  hidden: ["xxx"],
  synonyms: [{ variant: "gesi", canonical: "gas" }],
  ...extra
});

const api = {
  getTrendingOverview: vi.fn(),
  hideTrending: vi.fn(async () => undefined),
  unhideTrending: vi.fn(async () => undefined),
  setSynonym: vi.fn(async () => undefined),
  removeSynonym: vi.fn(async () => undefined)
};
vi.mock("../../api/index.js", () => ({ api, default: api }));
vi.mock("../../components/Toast.jsx", () => ({ useToast: () => ({ push }) }));
vi.mock("../../hooks/usePermissions.js", () => ({
  usePermissions: () => ({ can: () => canManage, why: () => (canManage ? "" : "Only reviewers and support admins can do this") })
}));

const { default: TrendingPage } = await import("./TrendingPage.jsx");

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TrendingPage />
    </QueryClientProvider>
  );

beforeEach(() => {
  canManage = true;
  push.mockReset();
  Object.values(api).forEach((f) => f.mockClear?.());
  api.getTrendingOverview.mockReset().mockResolvedValue(overview());
});
afterEach(cleanup);

describe("Trending page", () => {
  it("shows popular and rising together, with what each word turned out to be", async () => {
    show();
    const popular = await screen.findByRole("table", { name: "Popular this week" });
    const rows = within(popular).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual([
      "gas cylinder (rising)", "mama njeri bakery", "flash sneakers", "barber"
    ]);
    expect(within(rows[0]).getByText(/Product/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Store/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Flash sale/)).toBeInTheDocument();
    expect(within(rows[3]).getByText(/Category/)).toBeInTheDocument();
    const rising = screen.getByRole("table", { name: "Rising now" });
    expect(within(rising).getByText("solar lamp")).toBeInTheDocument();
    expect(within(rising).getByText(/7\.0×, 14 people/)).toBeInTheDocument();
  });

  it("warns, loudly, when the lists are out of date", async () => {
    api.getTrendingOverview.mockResolvedValue(overview({ status: { ok: false, computedAt: "2026-11-16T01:00:00Z", ageMinutes: 480, staleAfterHours: 5, minPeople: 3 } }));
    show();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The trending lists are out of date");
    expect(alert).toHaveTextContent("8 hours ago");
    expect(alert).toHaveTextContent("live count");
  });

  it("says so when the lists were never built", async () => {
    api.getTrendingOverview.mockResolvedValue(overview({ status: { ok: false, computedAt: null, ageMinutes: null, staleAfterHours: 5, minPeople: 3 }, popular: [], rising: [] }));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("never been built");
    expect(screen.getByText(/Shoppers see the busiest categories instead/)).toBeInTheDocument();
  });

  it("does not warn when the lists are fresh", async () => {
    show();
    await screen.findByRole("table", { name: "Popular this week" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Last rebuilt/)).toBeInTheDocument();
  });

  it("has no way to place a word by hand: no Pin buttons and no Pinned section", async () => {
    show();
    await screen.findByRole("table", { name: "Popular this week" });
    expect(screen.queryByRole("button", { name: /Pin .* to the top/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Unpin/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pinned" })).toBeNull();
    expect(screen.queryByLabelText("Pin for")).toBeNull();
  });

  it("hides a word, and shows it again", async () => {
    show();
    await screen.findByRole("table", { name: "Popular this week" });
    fireEvent.click(screen.getByRole("button", { name: "Hide mama njeri bakery" }));
    await waitFor(() => expect(api.hideTrending).toHaveBeenCalledWith("mama njeri bakery"));
    fireEvent.click(screen.getByRole("button", { name: "Show xxx again" }));
    await waitFor(() => expect(api.unhideTrending).toHaveBeenCalledWith("xxx"));
  });

  it("adds and removes a synonym", async () => {
    show();
    const save = await screen.findByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("People type"), { target: { value: "mkate" } });
    fireEvent.change(screen.getByLabelText("Count it as"), { target: { value: "bread" } });
    fireEvent.click(save);
    await waitFor(() => expect(api.setSynonym).toHaveBeenCalledWith("mkate", "bread"));
    await waitFor(() => expect(screen.getByLabelText("People type")).toHaveValue(""));
    fireEvent.click(screen.getByRole("button", { name: "Remove gesi" }));
    await waitFor(() => expect(api.removeSynonym).toHaveBeenCalledWith("gesi"));
  });

  it("tells the admin when the database refuses a change", async () => {
    api.hideTrending.mockRejectedValueOnce(new Error("term must be at least 2 characters"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Hide gas cylinder" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith({ message: "term must be at least 2 characters", tone: "error" }));
  });

  it("a role that can look but not change sees the buttons disabled, with the reason", async () => {
    canManage = false;
    show();
    const hide = await screen.findByRole("button", { name: "Hide gas cylinder" });
    expect(hide).toBeDisabled();
    expect(hide).toHaveAttribute("title", expect.stringContaining("Only reviewers and support admins"));
  });

  it("has no serious accessibility problems", async () => {
    const { container } = show();
    await screen.findByRole("table", { name: "Popular this week" });
    expect(await seriousViolations(container)).toEqual([]);
  });
});
