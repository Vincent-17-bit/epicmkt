import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let mockAuth;
vi.mock("./AuthContext.jsx", () => ({ useAuth: () => mockAuth }));

const { default: RoleGuard } = await import("../routes/RoleGuard.jsx");
const { default: RequireAdmin } = await import("./RequireAdmin.jsx");
const { default: IdleGuard, IDLE_NOTICE_KEY } = await import("./IdleGuard.jsx");

const baseAuth = (over = {}) => ({
  status: "admin",
  demo: false,
  admin: { role: "owner" },
  signOut: vi.fn(),
  retry: vi.fn(),
  ...over,
});

beforeEach(() => {
  mockAuth = baseAuth();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("RoleGuard", () => {
  it("shows the page to a role that may open it", () => {
    mockAuth = baseAuth({ admin: { role: "finance" } });
    render(<RoleGuard permission="payments.confirm"><p>payments page</p></RoleGuard>);
    expect(screen.getByText("payments page")).toBeInTheDocument();
  });

  it("blocks a role that may not, and says who can", () => {
    mockAuth = baseAuth({ admin: { role: "support" } });
    render(<RoleGuard permission="payments.confirm"><p>payments page</p></RoleGuard>);
    expect(screen.queryByText("payments page")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Only Owners and Finance admins can confirm, reject or assign payments. You are signed in as Support.");
  });

  it("blocks settings for everyone but the owner", () => {
    for (const role of ["reviewer", "finance", "support"]) {
      mockAuth = baseAuth({ admin: { role } });
      const { unmount } = render(<RoleGuard permission="settings.view"><p>settings</p></RoleGuard>);
      expect(screen.queryByText("settings")).not.toBeInTheDocument();
      unmount();
    }
    mockAuth = baseAuth();
    render(<RoleGuard permission="settings.view"><p>settings</p></RoleGuard>);
    expect(screen.getByText("settings")).toBeInTheDocument();
  });
});

describe("sign-in gate", () => {
  const renderGate = (path = "/admin/payments") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/login" element={<p>login page</p>} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin/payments" element={<p>payments content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

  it("a fully signed-in admin sees the page", () => {
    renderGate();
    expect(screen.getByText("payments content")).toBeInTheDocument();
  });

  it("signed out goes to the login page", () => {
    mockAuth = baseAuth({ status: "signedOut" });
    renderGate();
    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("an error asks to try again and offers sign out", () => {
    mockAuth = baseAuth({ status: "error", errorMessage: "boom" });
    renderGate();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mockAuth.retry).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("the idle guard runs for real admins but not in demo mode", () => {
    vi.useFakeTimers();
    mockAuth = baseAuth({ demo: true });
    renderGate();
    act(() => vi.advanceTimersByTime(14 * 60_000));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    cleanup();
    mockAuth = baseAuth();
    renderGate();
    act(() => vi.advanceTimersByTime(14 * 60_000));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("idle timeout", () => {
  it("warns at 13 minutes, Stay signed in resets it, and 15 idle minutes signs out with a notice", () => {
    vi.useFakeTimers();
    render(<IdleGuard />);
    act(() => vi.advanceTimersByTime(12 * 60_000));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("You will be signed out in 2:00");

    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockAuth.signOut).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(15 * 60_000));
    expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(IDLE_NOTICE_KEY)).toMatch(/15 minutes/);
  });

  it("activity before the warning keeps the session alive", () => {
    vi.useFakeTimers();
    render(<IdleGuard />);
    act(() => vi.advanceTimersByTime(10 * 60_000));
    fireEvent.keyDown(window, { key: "a" });
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });
});
