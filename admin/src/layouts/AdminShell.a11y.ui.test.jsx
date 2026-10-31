import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { navGroups } from "./navConfig.js";
import { ROLES, roleCan } from "../auth/permissions.js";
import { stubBrowserApis } from "../test/mountApp.jsx";
import { ThemeProvider } from "../theme/ThemeProvider.jsx";
import { ToastProvider } from "../components/Toast.jsx";

const state = vi.hoisted(() => ({ role: "owner" }));
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ admin: { role: state.role, email: "a@test.ke", displayName: "Ada Admin" }, demo: true, signOut: vi.fn() }),
}));
vi.mock("../hooks/useAdminCounts.js", () => ({ useAdminCounts: () => ({ data: undefined }), useLiveRefresh: () => {} }));
vi.mock("../components/SystemStatusCard.jsx", () => ({ default: () => <div>System status stub</div> }));
const { api } = vi.hoisted(() => ({
  api: {
    getUnreadMessages: vi.fn(async () => 0),
    getUnreadNotificationCount: vi.fn(async () => 0),
    getNotifications: vi.fn(async () => []),
    listMessages: vi.fn(async () => []),
    globalSearch: vi.fn(async () => ({ businesses: [], applications: [] })),
  },
}));
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: AdminLayout } = await import("./AdminLayout.jsx");
const { default: Modal } = await import("../components/Modal.jsx");
const { default: Popover } = await import("../components/DataTable/Popover.jsx");

const mountShell = (path = "/admin/businesses") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<p>home body</p>} />
                <Route path="*" element={<button type="button">page action</button>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  stubBrowserApis();
  localStorage.clear();
  window.innerWidth = 1440;
  state.role = "owner";
});
afterEach(cleanup);

const sidebarLabels = () => within(screen.getByRole("navigation", { name: "Admin navigation" })).getAllByRole("link").map((a) => a.textContent.replace(/\d+$/, "").trim());
const allItems = navGroups.flatMap((g) => g.items);

describe("sidebar visibility follows the role", () => {
  it.each(ROLES)("%s sees exactly the pages its permissions allow", (role) => {
    state.role = role;
    mountShell();
    const expected = allItems.filter((i) => !i.permission || roleCan(role, i.permission)).map((i) => i.label);
    expect(sidebarLabels()).toEqual(expected);
  });

  it("spot checks: settings is owner-only, finance has no moderation, support has no applications", () => {
    state.role = "owner";
    mountShell();
    expect(sidebarLabels()).toContain("Settings");
    cleanup();
    state.role = "finance";
    mountShell();
    expect(sidebarLabels()).toContain("Payments");
    expect(sidebarLabels()).not.toContain("Moderation");
    expect(sidebarLabels()).not.toContain("Settings");
    cleanup();
    state.role = "support";
    mountShell();
    expect(sidebarLabels()).not.toContain("Applications");
    expect(sidebarLabels()).toContain("Messages");
  });

  it("marks only the current page with aria-current", () => {
    mountShell("/admin/payments");
    const current = within(screen.getByRole("navigation", { name: "Admin navigation" })).getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent.replace(/\d+$/, "").trim())).toEqual(["Payments"]);
  });
});

describe("landmarks and the keyboard path through the header", () => {
  it("has one main, a header, and a navigation with a name", () => {
    mountShell();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Admin navigation" })).toBeInTheDocument();
  });

  it("the first Tab stop is the skip link, and it targets a focusable main region", async () => {
    const user = userEvent.setup();
    mountShell();
    await user.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    // Browsers move focus to a link's #fragment target; jsdom does not, so we assert the wiring and
    // check the real focus move in Chromium (docs/admin-a11y.md, "Manual and browser checks").
    expect(skip).toHaveAttribute("href", "#admin-content");
    const target = document.getElementById("admin-content");
    expect(target).not.toBeNull();
    expect(target.tagName).toBe("MAIN");
    expect(target).toHaveAttribute("tabindex", "-1");
  });

  it("header controls are reachable in reading order and every one has a name", async () => {
    const user = userEvent.setup();
    mountShell();
    const order = [];
    for (let i = 0; i < 40; i += 1) {
      await user.tab();
      const el = document.activeElement;
      if (!el || el === document.body) break;
      order.push(el);
      if (el.textContent === "page action") break;
    }
    const header = screen.getByRole("banner");
    const inHeader = order.filter((el) => header.contains(el));
    expect(inHeader.length).toBeGreaterThanOrEqual(4); // search, bell, theme, account
    for (const el of order) {
      const name = el.getAttribute("aria-label") || el.textContent.trim() || el.getAttribute("title") || el.getAttribute("placeholder");
      expect(name, `${el.tagName}.${el.className}`).toBeTruthy();
    }
    // sidebar comes before the header, the header before the page
    const nav = screen.getByRole("navigation", { name: "Admin navigation" });
    const firstNav = order.findIndex((el) => nav.contains(el));
    const firstHeader = order.findIndex((el) => header.contains(el));
    const page = order.findIndex((el) => el.textContent === "page action");
    expect(firstNav).toBeLessThan(firstHeader);
    expect(firstHeader).toBeLessThan(page);
  });

  it("the account link name contains its visible initials and names the person (WCAG 2.5.3)", () => {
    mountShell();
    const link = screen.getByRole("link", { name: /account of Ada Admin/ });
    expect(link.getAttribute("aria-label")).toMatch(new RegExp("^" + link.textContent.trim()));
  });

  it("Escape closes the bell and puts focus back on it", async () => {
    const user = userEvent.setup();
    mountShell();
    const bell = screen.getByRole("button", { name: /^Notifications/ });
    await user.click(bell);
    expect(bell).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(bell).toHaveAttribute("aria-expanded", "false"));
    expect(bell).toHaveFocus();
  });
});

describe("mobile More sheet", () => {
  it("moves focus in, traps Tab, closes on Escape and returns focus to the More button", async () => {
    const user = userEvent.setup();
    mountShell();
    const more = screen.getByRole("button", { name: /More/ });
    await user.click(more);
    const sheet = screen.getByRole("dialog", { name: "More" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(sheet.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      await user.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(sheet.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument());
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
});

function ModalHarness({ onClose }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      {open ? (
        <Modal title="Confirm" onClose={() => { onClose(); setOpen(false); }}>
          <button type="button">First</button>
          <button type="button">Second</button>
          <button type="button">Last</button>
        </Modal>
      ) : null}
    </>
  );
}

describe("dialogs", () => {
  it("focus goes in, Tab and Shift+Tab wrap, Escape closes, focus returns to the opener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Confirm" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus(); // wrapped backwards
    await user.tab();
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus(); // wrapped forwards
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it("a popover closes on Escape and returns focus to its button", async () => {
    const user = userEvent.setup();
    render(<Popover label="Columns"><button type="button">Choose</button></Popover>);
    const trigger = screen.getByRole("button", { name: "Columns" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});

describe("toasts", () => {
  it("live in a polite status region that is always in the page", async () => {
    render(<ToastProvider><p>x</p></ToastProvider>);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});
