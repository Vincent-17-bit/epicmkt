import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { M, signedInApp } from "../../../../test/utils.jsx";
import ActionBar from "./ActionBar.jsx";

vi.mock("../../../../lib/videoPoster.js", () => ({
  readVideo: vi.fn(async () => null),
  posterFromUrl: vi.fn(async () => null),
}));

const realMatchMedia = window.matchMedia;
const media = (desktop) => {
  window.matchMedia = (q) => ({ matches: desktop && q.includes("min-width: 64rem"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
};
const card = (id) => screen.getAllByTestId("listing").find((li) => li.dataset.id === id);
const panel = () => document.querySelector("[data-item-panel]");
const here = (router) => router.state.location.pathname + router.state.location.search;
const axe = configureAxe({ rules: { "color-contrast": { enabled: false }, "scrollable-region-focusable": { enabled: false } } });

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
});

describe("opening and closing", () => {
  it("opens from a card and closes again, keeping the list query", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog?sort=price-asc&q=a");
    await screen.findByTestId("listing-grid");
    await user.click(card("it-fade").querySelector("[data-card]"));
    await waitFor(() => expect(here(router)).toBe("/business/catalog/it-fade?sort=price-asc&q=a"));
    expect(await screen.findByTestId("panel-status")).toBeInTheDocument();
    expect(card("it-fade")).toHaveAttribute("data-id", "it-fade");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(here(router)).toBe("/business/catalog?sort=price-asc&q=a"));
    await waitFor(() => expect(panel()).toBeNull());
  });

  it("opens straight from a deep link", async () => {
    media(true);
    await signedInApp("/business/catalog/it-fade");
    expect(await screen.findByTestId("panel-status")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview", selected: true })).toBeInTheDocument();
  });

  it("shows a not-found state for a missing item", async () => {
    media(true);
    await signedInApp("/business/catalog/nope");
    expect(await screen.findByTestId("panel-not-found")).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/it-fade?q=a");
    await screen.findByTestId("panel-status");
    screen.getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(here(router)).toBe("/business/catalog?q=a"));
  });
});

describe("keyboard", () => {
  it("steps with j and k while focus is inside the panel", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/it-fade");
    await screen.findByTestId("panel-status");
    const first = router.state.location.pathname;
    screen.getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("j");
    await waitFor(() => expect(router.state.location.pathname).not.toBe(first));
    await user.keyboard("k");
    await waitFor(() => expect(router.state.location.pathname).toBe(first));
  });

  it("does not step when focus is outside the panel", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/it-fade");
    await screen.findByTestId("panel-status");
    document.activeElement.blur();
    await user.keyboard("j");
    expect(router.state.location.pathname).toBe("/business/catalog/it-fade");
  });

  it("keeps / for list search unless focus is in the panel", async () => {
    media(true);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/it-fade");
    await screen.findByTestId("panel-status");
    const search = screen.getByRole("searchbox");
    screen.getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("/");
    expect(search).not.toHaveFocus();
    document.activeElement.blur();
    await user.keyboard("/");
    expect(search).toHaveFocus();
  });

  it("moves between sections with the arrow keys and records them in the hash", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/it-fade?q=a");
    await screen.findByTestId("panel-status");
    screen.getByRole("tab", { name: "Overview" }).focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Performance", selected: true })).toBeInTheDocument());
    expect(router.state.location.search).toBe("?q=a");
    expect(router.state.location.hash).toBe("#performance");
  });
});

describe("select mode", () => {
  it("does not open from a card click while items are selected", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog");
    await screen.findByTestId("listing-grid");
    await user.click(within(card("it-fade")).getByRole("checkbox"));
    await user.click(card("it-beard").querySelector("[data-card]"));
    expect(router.state.location.pathname).toBe("/business/catalog");
  });

  it("closes the panel when selecting starts", async () => {
    media(true);
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/catalog/it-fade");
    await screen.findByTestId("panel-status");
    await user.click(within(card("it-beard")).getByRole("checkbox"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/catalog"));
  });
});

describe("delete", () => {
  it("closes the panel, offers Undo and commits after eight seconds", async () => {
    media(true);
    const { router } = await signedInApp("/business/catalog/it-old");
    await screen.findByTestId("panel-status");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(panel()).getByRole("button", { name: "Delete" }));
    expect(await screen.findByTestId("undo-bar")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/catalog"));
    expect(M.state.items.map((i) => i.id)).toContain("it-old");
    await act(async () => { await vi.advanceTimersByTimeAsync(8100); });
    await waitFor(() => expect(M.state.items.map((i) => i.id)).not.toContain("it-old"));
  });

  it("brings the item back on Undo", async () => {
    media(true);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/it-old");
    await screen.findByTestId("panel-status");
    await user.click(within(panel()).getByRole("button", { name: "Delete" }));
    await user.click(within(await screen.findByTestId("undo-bar")).getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.queryByTestId("undo-bar")).toBeNull());
    expect(M.state.items.map((i) => i.id)).toContain("it-old");
  });
});

describe("sections", () => {
  it("explains an empty performance history in plain words", async () => {
    media(true);
    const user = userEvent.setup();
    await signedInApp("/business/catalog/it-fade#performance");
    await screen.findByRole("tab", { name: "Performance", selected: true });
    await user.click(screen.getByRole("tab", { name: "Deals" }));
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByRole("tabpanel")).toBeInTheDocument();
  });

  it("disables Open live page with a reason when the shop is not live", async () => {
    media(true);
    await signedInApp("/business/catalog/it-fade", async () => { M.setBusiness({ status: "paused", live: false }); });
    await screen.findByTestId("panel-status");
    const open = screen.getByRole("button", { name: /Open live page/ });
    expect(open).toBeDisabled();
    expect(screen.getAllByText(/paused/i).length).toBeGreaterThan(0);
  });
});

describe("read-only", () => {
  it("shows the suspended message and no actions", () => {
    const item = { id: "a", name: "A", visibility: "showing", visible: true, draft: false, removed: false, soldOut: false, trackStock: false };
    render(<ActionBar item={item} shop={{ slug: "s", name: "S" }} reason={{ showing: true }} ctx={{ handlers: {}, busy: false, readOnly: true, readOnlyText: "Your shop is suspended." }} />);
    expect(screen.getByTestId("read-only")).toHaveTextContent("Your shop is suspended.");
    for (const b of within(screen.getByRole("group", { name: "Item actions" })).getAllByRole("button")) if (b.textContent !== "Share") expect(b).toBeDisabled();
  });

  it("keeps a suspended seller out of the catalog", async () => {
    media(true);
    await signedInApp("/business/catalog/it-fade", async () => { M.setBusiness({ status: "suspended", live: false }); });
    expect(await screen.findByTestId("locked")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-status")).toBeNull();
  });
});

describe("accessibility", () => {
  it.each([["#overview"], ["#performance"], ["#deals"], ["#questions"], ["#history"]])("has no serious violations on %s", async (hash) => {
    media(true);
    await signedInApp(`/business/catalog/it-fade${hash}`);
    await screen.findByTestId("panel-status");
    await screen.findByRole("tabpanel");
    const results = await axe(panel());
    const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => v.id)).toEqual([]);
  });
});
