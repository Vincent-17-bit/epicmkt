import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api/index.js", async (importOriginal) => {
  const real = await importOriginal();
  const { seedItems } = await import("../api/mockItems.js");
  const items = seedItems("ES100005", 150);
  const stats = { total: 150, items_limit: 200 };
  return { ...real, listItems: async () => ({ items, signals: [], stats }) };
});

const { useSession } = await import("../state/session.js");
const { default: Listings } = await import("./Listings.jsx");

beforeEach(() => {
  useSession.setState({ phase: "authed", me: { business: { plan_key: "premium", status: "live", paid_until: new Date(Date.now() + 20 * 86400000).toISOString() }, settings: { saved_views: [] } } });
});

describe("150 items", () => {
  it("renders the first 60 quickly and filters without lag", async () => {
    const start = performance.now();
    render(<MemoryRouter initialEntries={["/catalog"]}><Listings /></MemoryRouter>);
    await screen.findByTestId("showing-summary");
    const list = screen.getByRole("list", { name: "Your items" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(60);
    console.log("first render ms", Math.round(performance.now() - start));
    expect(performance.now() - start).toBeLessThan(4000);
    const t = performance.now();
    await userEvent.click(screen.getAllByRole("checkbox", { name: /^Select / })[0]);
    console.log("select click ms", Math.round(performance.now() - t));
    expect(performance.now() - t).toBeLessThan(2500);
    await userEvent.click(screen.getByRole("button", { name: "Show 60 more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(120);
    await userEvent.click(screen.getByRole("button", { name: "Show 30 more" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(150);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search your items" }), "wedding");
    await waitFor(() => expect(within(list).getAllByRole("listitem").length).toBeLessThan(20));
  }, 40000);
});
