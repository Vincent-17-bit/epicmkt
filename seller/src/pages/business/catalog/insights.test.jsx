import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { M, signedInApp } from "../../../test/utils.jsx";

vi.mock("../../../lib/videoPoster.js", () => ({
  readVideo: vi.fn(async () => ({ durationSec: 12, width: 640, height: 360, poster: new Blob(["p"], { type: "image/jpeg" }) })),
  posterFromUrl: vi.fn(async () => null),
}));

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = (q) => ({ matches: q.includes("min-width: 1024px"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  try { localStorage.clear(); } catch { /* none */ }
});
afterEach(() => { window.matchMedia = realMatchMedia; });

const card = (id) => screen.getAllByTestId("listing").find((li) => li.dataset.id === id);
const openInsights = async (user, id = "it-fade") => {
  await screen.findByTestId("listing-grid");
  const trigger = within(card(id)).getByRole("button", { name: /^More actions/ });
  await user.click(trigger);
  await user.click(within(card(id)).getByRole("menuitem", { name: /^Views, deals and history/ }));
  return screen.findByRole("tablist", { name: "Item insights" });
};

describe("Performance on the catalog page", () => {
  it("shows views and taps with the seven ranges, and the same panel on Standard and Premium", async () => {
    const user = userEvent.setup();
    for (const plan of ["standard", "premium"]) {
      const { unmount } = await signedInApp("/business/catalog", async () => M.setBusiness({ planKey: plan }));
      const panel = await screen.findByTestId("performance-panel");
      await waitFor(() => expect(within(panel).getByTestId("perf-view")).toBeInTheDocument());
      expect([...panel.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["7 days", "1 month", "6 months", "12 months", "24 months", "36 months", "All time"]);
      for (const label of ["Views", "WhatsApp taps", "Call taps", "Directions taps"]) expect(within(panel).getByText(label)).toBeInTheDocument();
      const before = within(panel).getByTestId("perf-view").textContent;
      await user.selectOptions(panel.querySelector("select"), "12m");
      await waitFor(() => expect(within(panel).getByTestId("perf-view").textContent).not.toBe(before));
      unmount();
    }
  });
});

describe("item Overview, Deals and History", () => {
  it("Standard sees 5 history entries and one plain line with a link to Subscription", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    await openInsights(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    const history = await screen.findByTestId("history");
    expect(within(history).getAllByRole("listitem")).toHaveLength(5);
    const lock = within(history).getByTestId("history-locked");
    expect(lock).toHaveTextContent("Older changes are part of Premium.");
    expect(within(lock).getByRole("link", { name: /see plans and upgrade/i })).toHaveAttribute("href", "/business/subscription");
  });

  it("Premium sees the full history and no lock line", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog", async () => M.setBusiness({ planKey: "premium" }));
    await openInsights(user);
    await user.click(screen.getByRole("tab", { name: "History" }));
    const history = await screen.findByTestId("history");
    expect(within(history).getAllByRole("listitem").length).toBeGreaterThan(5);
    expect(screen.queryByTestId("history-locked")).toBeNull();
  });

  it("Deals attribution is Premium only: Standard gets one line and no numbers", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    await openInsights(user);
    await user.click(screen.getByRole("tab", { name: "Deals" }));
    const lock = await screen.findByTestId("deals-locked");
    expect(lock).toHaveTextContent("part of Premium");
    expect(within(lock).getByRole("link")).toHaveAttribute("href", "/business/subscription");
    expect(screen.queryByTestId("deals")).toBeNull();
  });

  it("Overview shows the item's own views and taps and tolerates items with no variants array", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog", async () => { delete M.state.items[0].variants; });
    await openInsights(user);
    const dialog = screen.getByRole("dialog");
    const panel = await within(dialog).findByTestId("performance-panel");
    await waitFor(() => expect(within(panel).getByTestId("perf-view")).toBeInTheDocument());
  });
});

describe("Duplicate", () => {
  it("creates a draft copy and opens the editor on Basics", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    await screen.findByTestId("listing-grid");
    await user.click(within(card("it-fade")).getByRole("button", { name: /^More actions/ }));
    await user.click(within(card("it-fade")).getByRole("menuitem", { name: /^Duplicate/ }));
    await waitFor(() => expect(M.state.items.at(-1)).toMatchObject({ name: "Fade cut (copy)", draft: true, visible: false }));
    await screen.findByRole("heading", { level: 1, name: /Fade cut \(copy\)|Edit item|Add item/ });
    expect(document.body.querySelector("#sec-basics-title, [data-step='basics']")).not.toBeNull();
  });
});
