import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { freshSession, renderApp } from "../test/helpers.jsx";
import * as mock from "../api/mock.js";

const type = async (user, label, value) => {
  const field = await screen.findByLabelText(label, { selector: "input" });
  await user.clear(field);
  await user.type(field, value);
};

const signIn = async (user, id, password) => {
  await type(user, "Seller ID", id);
  await type(user, "Password", password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  freshSession();
});
afterEach(() => vi.useRealTimers());

const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

describe("login", () => {
  it("shows one generic message for a wrong password and for an unknown Seller ID", async () => {
    const user = setup();
    renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    await signIn(user, "ES100001", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Seller ID or password is incorrect.");
    await signIn(user, "ES999999", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Seller ID or password is incorrect.");
  });

  it("rejects a malformed Seller ID before calling the server", async () => {
    const user = setup();
    renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    await signIn(user, "nonsense", "x");
    expect(await screen.findByText(/for example ES123456/)).toBeInTheDocument();
  });

  it("locks the form after five failures and reports the wait", async () => {
    const user = setup();
    renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    for (let i = 0; i < 5; i += 1) {
      await signIn(user, "ES100001", "wrong");
      await screen.findByRole("alert");
    }
    expect(await screen.findByText(/Too many attempts. Try again in 15 minutes./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("trims and ignores case in the Seller ID, then opens the dashboard", async () => {
    const user = setup();
    const { router } = renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    await signIn(user, "  es100001  ", mock.DEMO_PASSWORD);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByText("Fade Kings Barbershop", { selector: "h3 a, h3" })).toBeInTheDocument();
  });

  it("toggles password visibility and links to help and forgot password", async () => {
    const user = setup();
    renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    const field = screen.getByLabelText("Password", { selector: "input" });
    expect(field).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
    expect(screen.getByRole("link", { name: "Help" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password" })).toBeInTheDocument();
    expect(screen.getByText(/temporary password/)).toBeInTheDocument();
    expect(screen.queryByText(/sign up|register|create account/i)).toBeNull();
  });

  it("blocks a deleted business at sign-in with the deletion message", async () => {
    const user = setup();
    renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    await signIn(user, "ES100009", mock.DEMO_PASSWORD);
    expect(await screen.findByRole("alert")).toHaveTextContent("This business has been deleted");
  });

  it("never keeps the password in browser storage", async () => {
    const user = setup();
    renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    await signIn(user, "ES100001", mock.DEMO_PASSWORD);
    await screen.findByRole("heading", { name: /Live/ });
    const dump = JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage });
    expect(dump).not.toContain(mock.DEMO_PASSWORD);
    expect(dump).not.toMatch(/otp|"code"|password/i);
  });
});

describe("first login", () => {
  const signedIn = async (path = "/") => {
    const user = setup();
    const view = renderApp("/login");
    await screen.findByRole("heading", { name: "Seller login" });
    await signIn(user, "ES100003", mock.DEMO_PASSWORD);
    await screen.findByRole("heading", { name: "First login" });
    if (path !== "/") await act(() => view.router.navigate(path));
    return { user, ...view };
  };

  it.each(["/", "/catalog", "/account", "/subscription", "/settings", "/help", "/notifications"])("holds every route until the password is changed (%s)", async (path) => {
    const { router } = await signedIn(path);
    await screen.findByRole("heading", { name: "First login" });
    expect(router.state.location.pathname).toBe("/first-login");
  });

  it("masks the phone, enforces the OTP, rules and confirmation, then continues to onboarding", async () => {
    const { user, router } = await signedIn();
    expect(screen.getByText(/\+2547\*\*\*\*\*678/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send code" }));
    const resend = await screen.findByRole("button", { name: /Resend code in/ });
    expect(resend).toBeDisabled();
    await type(user, "6-digit code", "12a3456");
    expect(screen.getByLabelText("6-digit code")).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const save = screen.getByRole("button", { name: "Save and continue" });
    expect(save).toBeDisabled();
    await type(user, "New password", "short");
    expect(screen.getByText("Password strength: Weak")).toBeInTheDocument();
    expect(screen.getByText("At least 10 characters").closest("li")).toHaveAttribute("data-ok", "false");
    await type(user, "New password", "Brand-New-Pass1");
    expect(screen.getByText("At least 10 characters").closest("li")).toHaveAttribute("data-ok", "true");
    expect(screen.getByText(/Password strength: (Good|Strong)/)).toBeInTheDocument();
    await type(user, "Confirm new password", "Different1Pass");
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await type(user, "Confirm new password", "Brand-New-Pass1");
    await user.click(save);
    await waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
  });

  it("counts wrong codes down to zero attempts", async () => {
    const { user } = await signedIn();
    await user.click(screen.getByRole("button", { name: "Send code" }));
    for (let left = 4; left >= 0; left -= 1) {
      await type(user, "6-digit code", "000000");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await type(user, "New password", "Brand-New-Pass1");
      await type(user, "Confirm new password", "Brand-New-Pass1");
      await user.click(screen.getByRole("button", { name: "Save and continue" }));
      await screen.findByText(left === 0 ? /No attempts left/ : new RegExp(`${left} attempts? left`));
    }
    expect(screen.getByLabelText("6-digit code")).toBeDisabled();
  });

  it("lets you resend after 60 seconds", async () => {
    const { user } = await signedIn();
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByRole("button", { name: /Resend code in 1:00|Resend code in 0:59/ });
    await act(async () => {
      vi.advanceTimersByTime(61000);
    });
    expect(await screen.findByRole("button", { name: "Resend code" })).toBeEnabled();
  });
});

describe("forgot password", () => {
  const GENERIC = "If these details match a listing, we have sent a code to its phone number.";

  const requestCode = async (user, id, phone) => {
    await screen.findByRole("heading", { name: "Forgot password" });
    await type(user, "Seller ID", id);
    await type(user, "Phone number", phone);
    await user.click(screen.getByRole("button", { name: "Send code" }));
  };

  it.each([
    ["a real Seller ID", "ES100001", "0712345678"],
    ["an unknown Seller ID", "ES999999", "0700000000"],
    ["a real Seller ID with the wrong phone", "ES100001", "0799999999"]
  ])("always answers with the same message for %s", async (_, id, phone) => {
    const user = setup();
    renderApp("/forgot-password");
    await requestCode(user, id, phone);
    expect(await screen.findByText(GENERIC)).toBeInTheDocument();
  });

  it("runs the OTP and new-password steps and returns to login with a success message", async () => {
    const user = setup();
    const { router } = renderApp("/forgot-password");
    await requestCode(user, "ES100001", "0712345678");
    await screen.findByText(GENERIC);
    expect(screen.getByRole("button", { name: /Resend code in/ })).toBeDisabled();
    expect(screen.getByText("5 attempts left.")).toBeInTheDocument();
    await type(user, "6-digit code", "123456");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await type(user, "New password", "Reset-Pass-99x");
    await type(user, "Confirm new password", "Reset-Pass-99x");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(await screen.findByText(/Your password was changed/)).toBeInTheDocument();
  });

  it("stops after five wrong codes", async () => {
    const user = setup();
    renderApp("/forgot-password");
    await requestCode(user, "ES100001", "0712345678");
    await screen.findByText(GENERIC);
    for (let i = 0; i < 5; i += 1) {
      await type(user, "6-digit code", "999999");
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await type(user, "New password", "Reset-Pass-99x");
      await type(user, "Confirm new password", "Reset-Pass-99x");
      await user.click(screen.getByRole("button", { name: "Change password" }));
      await screen.findByText(/That code is not valid or has expired/);
    }
    expect(await screen.findByText(/No attempts left/)).toBeInTheDocument();
    expect(screen.getByLabelText("6-digit code")).toBeDisabled();
  });
});

describe("OTP limits in the mock", () => {
  it("allows one send per minute and five per hour", async () => {
    await mock.login("ES100001", mock.DEMO_PASSWORD);
    await mock.requestOtp();
    await expect(mock.requestOtp()).rejects.toMatchObject({ code: "rate_limited", retryAfter: expect.any(Number) });
    for (let i = 0; i < 4; i += 1) {
      vi.advanceTimersByTime(61000);
      await mock.requestOtp();
    }
    vi.advanceTimersByTime(61000);
    await expect(mock.requestOtp()).rejects.toMatchObject({ code: "rate_limited" });
    vi.advanceTimersByTime(3600000);
    await expect(mock.requestOtp()).resolves.toMatchObject({ ok: true });
  });
});
