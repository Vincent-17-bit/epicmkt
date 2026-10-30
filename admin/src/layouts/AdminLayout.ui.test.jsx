import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SIDEBAR_KEY } from "../lib/sidebar.js";

vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ admin: { role: "owner", email: "owner@test.ke", displayName: "Owner Test" }, demo: true, signOut: vi.fn() }),
}));
vi.mock("../api/index.js", () => {
  const api = { getUnreadMessages: vi.fn(async () => 0) };
  return { api, default: api };
});
vi.mock("../hooks/useAdminCounts.js", () => ({
  useAdminCounts: () => ({ data: undefined }),
  useLiveRefresh: () => {},
}));
vi.mock("../components/SystemStatusCard.jsx", () => ({ default: () => <div>System status stub</div> }));
vi.mock("../components/GlobalSearch.jsx", () => ({ default: () => <div>Search stub</div> }));
vi.mock("../components/NotificationBell.jsx", () => ({ default: () => <div>Bell stub</div> }));
vi.mock("../theme/ThemeToggle.jsx", () => ({ default: () => <button type="button">Theme stub</button> }));

const { default: AdminLayout } = await import("./AdminLayout.jsx");

const mount = (path = "/admin") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<p>home body</p>} />
            <Route path="*" element={<p>page body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  window.innerWidth = 1440;
});
afterEach(cleanup);

describe("header", () => {
  it("the home page has a title and no breadcrumb trail", () => {
    mount("/admin");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Command center");
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });

  it("a section page names its section, then the page", () => {
    mount("/admin/payments");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Payments");
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByText("Moderation and payments")).toBeInTheDocument();
    expect(within(trail).getByText("Payments")).toHaveAttribute("aria-current", "page");
  });

  it("a detail page links back to its list", () => {
    mount("/admin/businesses/abc");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Business details");
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Businesses" })).toHaveAttribute("href", "/admin/businesses");
  });

  it("keeps the page title in the browser tab", () => {
    mount("/admin/audit");
    expect(document.title).toBe("Audit log · EpicMKT Admin");
  });

  it("offers a skip link to the main content", () => {
    mount();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#admin-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "admin-content");
  });
});

describe("sidebar", () => {
  const sidebar = () => screen.getByRole("navigation", { name: "Admin navigation" });

  it("shows section labels and marks the current page", () => {
    mount("/admin/businesses");
    expect(within(sidebar()).getByText("Sellers")).toBeInTheDocument();
    expect(within(sidebar()).getByText("Messaging")).toBeInTheDocument();
    expect(within(sidebar()).getByRole("link", { name: /Businesses/ })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar()).getByRole("link", { name: /Payments/ })).not.toHaveAttribute("aria-current");
  });

  it("starts open on a wide screen and collapsed on a tablet", () => {
    mount();
    expect(document.querySelector(".admin-app")).not.toHaveClass("admin-app--collapsed");
    cleanup();
    window.innerWidth = 768;
    mount();
    expect(document.querySelector(".admin-app")).toHaveClass("admin-app--collapsed");
  });

  it("collapses with the toggle, remembers the choice and keeps every link named", () => {
    mount();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);

    expect(document.querySelector(".admin-app")).toHaveClass("admin-app--collapsed");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("collapsed");
    // The text is hidden with CSS, not removed, so the links keep their names.
    expect(within(sidebar()).getByRole("link", { name: /Payments/ })).toBeInTheDocument();

    cleanup();
    mount();
    expect(document.querySelector(".admin-app")).toHaveClass("admin-app--collapsed");

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe("expanded");
    expect(document.querySelector(".admin-app")).not.toHaveClass("admin-app--collapsed");
  });

  it("does not open or change anything on hover", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    fireEvent.mouseEnter(document.querySelector(".admin-sidebar"));
    expect(document.querySelector(".admin-app")).toHaveClass("admin-app--collapsed");
  });

  it("keeps the mobile tab bar", () => {
    mount();
    const tabs = screen.getByRole("navigation", { name: "Main" });
    expect(within(tabs).getByText("Home")).toBeInTheDocument();
    expect(within(tabs).getByRole("button", { name: /More/ })).toBeInTheDocument();
  });
});
