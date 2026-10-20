import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let mockAuth;
vi.mock("./AuthContext.jsx", () => ({ useAuth: () => mockAuth }));

const { default: RoleGuard } = await import("../routes/RoleGuard.jsx");
const { default: MfaChallengePage } = await import("./MfaChallengePage.jsx");
const { default: MfaEnrolPage } = await import("./MfaEnrolPage.jsx");
const { default: RequireAdmin } = await import("./RequireAdmin.jsx");
const { default: IdleGuard, IDLE_NOTICE_KEY } = await import("./IdleGuard.jsx");

const baseAuth = (over = {}) => ({
  status: "admin",
  demo: false,
  admin: { role: "owner" },
  signOut: vi.fn(),
  retry: vi.fn(),
  challengeTotp: vi.fn(async () => ({ error: null })),
  enrolTotp: vi.fn(async () => ({ error: null, factorId: "f1", qr: "", secret: "ABCDEFGHIJKLMNOP" })),
  verifyEnrol: vi.fn(async () => ({ error: null })),
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

describe("authenticator code screen", () => {
  it("only enables Continue with six digits, strips letters, and sends the code", async () => {
    render(<MfaChallengePage />);
    const input = screen.getByLabelText("6-digit code");
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "12ab34" } });
    expect(input).toHaveValue("1234");
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "123456" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(mockAuth.challengeTotp).toHaveBeenCalledWith("123456"));
  });

  it("a wrong code shows a clear message and clears the field", async () => {
    mockAuth = baseAuth({ challengeTotp: vi.fn(async () => ({ error: new Error("Invalid TOTP code entered") })) });
    render(<MfaChallengePage />);
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code did not work");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("");
  });

  it("rate limiting is explained", async () => {
    mockAuth = baseAuth({ challengeTotp: vi.fn(async () => ({ error: new Error("too many requests") })) });
    render(<MfaChallengePage />);
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });
});

describe("authenticator setup screen", () => {
  it("starts setup once, shows the key in groups, and verifies with the first code", async () => {
    render(<MfaEnrolPage />);
    expect(await screen.findByText("ABCD EFGH IJKL MNOP")).toBeInTheDocument();
    expect(mockAuth.enrolTotp).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on and continue" }));
    await waitFor(() => expect(mockAuth.verifyEnrol).toHaveBeenCalledWith("f1", "654321"));
  });

  it("explains when the project has authenticator setup switched off", async () => {
    mockAuth = baseAuth({ enrolTotp: vi.fn(async () => ({ error: Object.assign(new Error("MFA enroll is disabled for TOTP"), { code: "mfa_totp_enroll_not_enabled" }) })) });
    render(<MfaEnrolPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("turned off for this Supabase project");
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

  it("an admin who has not set up an authenticator is walked through setup, not let in", async () => {
    mockAuth = baseAuth({ status: "needsEnrol" });
    renderGate();
    expect(await screen.findByText("Set up your authenticator")).toBeInTheDocument();
    expect(screen.queryByText("payments content")).not.toBeInTheDocument();
  });

  it("an admin with an authenticator is asked for a code, not let in", () => {
    mockAuth = baseAuth({ status: "needsChallenge" });
    renderGate();
    expect(screen.getByText("Enter your code")).toBeInTheDocument();
    expect(screen.queryByText("payments content")).not.toBeInTheDocument();
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
