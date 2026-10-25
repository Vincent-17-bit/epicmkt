import { describe, it, expect } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App.jsx";
import * as mock from "../api/mock.js";
import { M, signedInApp } from "../test/utils.jsx";

const GOOD = "Brand-New-Passw0rd";

// The seller has the account we sent them: Seller ID and a temporary password, no email yet.
const onTemporary = () => { M.state.business.mustChangePassword = true; };
const withVerifiedEmail = () => { Object.assign(M.state.business, { loginEmail: "jane@example.com", loginEmailVerified: true }); };

async function addEmail(user, { email = "jane@example.com", password = "Demo-Passw0rd", code = "123456" } = {}) {
  await user.click(await screen.findByRole("button", { name: "Add email" }));
  await user.type(screen.getByLabelText("Email address"), email);
  await user.type(screen.getByLabelText("Current password"), password);
  await user.click(screen.getByRole("button", { name: "Send code to this email" }));
  await user.type(await screen.findByLabelText("Code from email"), code);
  await user.click(screen.getByRole("button", { name: "Save email" }));
}

function loginApp() {
  mock.resetMock();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("finish setting up the sign-in", () => {
  it("a seller on the temporary password sees a notice that leads to Account, and the checklist there", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription", onTemporary);
    const banner = await screen.findByTestId("setup-banner");
    expect(banner).toHaveTextContent("Finish setting up your sign-in");
    await user.click(within(banner).getByRole("link", { name: "Go to Account" }));
    const setup = await screen.findByTestId("signin-setup");
    expect(setup).toHaveTextContent("Add and verify your email.");
    expect(setup).toHaveTextContent("Choose your own password.");
    expect(screen.queryByTestId("setup-banner")).toBeNull();
    expect(screen.getByTestId("signin-email")).toHaveTextContent("Not added yet");
    expect(screen.getByTestId("signin-password")).toHaveTextContent("Temporary");
  });

  it("no notice once the seller has their own password, and no checklist once the email is verified too", async () => {
    await signedInApp("/business/account", withVerifiedEmail);
    expect(await screen.findByTestId("signin-done")).toBeInTheDocument();
    expect(screen.queryByTestId("signin-setup")).toBeNull();
    expect(screen.queryByTestId("setup-banner")).toBeNull();
    expect(screen.getByTestId("signin-email")).toHaveTextContent("jane@example.com");
  });
});

describe("sign-in email", () => {
  it("is added with a code sent to it, and then shows on the page", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account", onTemporary);
    await addEmail(user);
    expect(await screen.findByRole("status")).toHaveTextContent("Email saved.");
    await waitFor(() => expect(screen.getByTestId("signin-email")).toHaveTextContent("jane@example.com"));
    expect(M.state.business.loginEmailVerified).toBe(true);
    expect(screen.getByRole("button", { name: "Change email" })).toBeInTheDocument();
  });

  it("checks the address, and needs the current password", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    await user.click(await screen.findByRole("button", { name: "Add email" }));
    await user.type(screen.getByLabelText("Email address"), "not-an-email");
    await user.type(screen.getByLabelText("Current password"), "Demo-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Send code to this email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");

    await user.clear(screen.getByLabelText("Email address"));
    await user.type(screen.getByLabelText("Email address"), "jane@example.com");
    await user.clear(screen.getByLabelText("Current password"));
    await user.type(screen.getByLabelText("Current password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Send code to this email" }));
    await user.type(await screen.findByLabelText("Code from email"), "123456");
    await user.click(screen.getByRole("button", { name: "Save email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That is not your current password.");
    expect(M.state.business.loginEmailVerified).toBe(false);
  });

  it("rejects a wrong code and an address another seller already uses", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    await addEmail(user, { code: "000000" });
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid or has expired.");
    expect(M.state.business.loginEmailVerified).toBe(false);
    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    await user.clear(screen.getByLabelText("Email address"));
    await user.type(screen.getByLabelText("Email address"), "taken@example.com");
    await user.click(screen.getByRole("button", { name: "Send code to this email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already used by another EpicMKT account");
  });
});

describe("password codes by SMS or email", () => {
  it("email is not offered until an email is verified", async () => {
    await signedInApp("/business/account");
    const email = await screen.findByRole("radio", { name: /Email/ });
    expect(email).toBeDisabled();
    expect(screen.getByRole("radio", { name: /SMS/ })).toBeChecked();
  });

  it("sends the code by email once one is verified, says where it went, and saves the new password", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account", () => { onTemporary(); withVerifiedEmail(); });
    await user.click(await screen.findByRole("radio", { name: /Email to jane@example.com/ }));
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Code sent to j*******@example.com.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Code from email"), "123456");
    await user.type(screen.getByLabelText("New password"), GOOD);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your password was changed."));
    expect(M.state.business.mustChangePassword).toBe(false);
    await waitFor(() => expect(screen.getByTestId("signin-password")).toHaveTextContent("Changed"));
    expect(screen.getByTestId("signin-done")).toBeInTheDocument();
  });

  it("SMS stays the default and the page can show the typed password", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    await user.click(await screen.findByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Code sent to +2547*****678.")).toBeInTheDocument();
    const field = screen.getByLabelText("New password");
    expect(field).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("checkbox", { name: "Show password" }));
    expect(field).toHaveAttribute("type", "text");
  });
});

describe("signing in", () => {
  it("works with the Seller ID, and with the verified email", async () => {
    const user = userEvent.setup();
    loginApp();
    mock.__mock.state.business.loginEmail = "jane@example.com";
    mock.__mock.state.business.loginEmailVerified = true;
    await user.type(await screen.findByLabelText("Seller ID or email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "Demo-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByTestId("shop-name")).toHaveTextContent("Demo Shop");
  });

  it("an email that has not been verified does not work", async () => {
    const user = userEvent.setup();
    loginApp();
    mock.__mock.state.business.loginEmail = "jane@example.com";
    await user.type(await screen.findByLabelText("Seller ID or email"), "jane@example.com");
    await user.type(screen.getByLabelText("Password"), "Demo-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Seller ID or password is incorrect.");
  });

  it("forgot password: pick SMS, enter the code and a new password, then sign in with it", async () => {
    const user = userEvent.setup();
    loginApp();
    await user.type(await screen.findByLabelText("Seller ID or email"), "ES100001");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByLabelText("Seller ID or email")).toHaveValue("ES100001");
    expect(screen.getByRole("radio", { name: /SMS/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/If we found an account, we have sent a code/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Code"), "123456");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 10 characters.");
    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), GOOD);
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Your password was changed. Sign in with your new password.");
    expect(screen.getByLabelText("Seller ID or email")).toHaveValue("ES100001"); // remembered, so only the password is needed
    await user.type(screen.getByLabelText("Password"), GOOD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByTestId("shop-name")).toBeInTheDocument();
  });

  it("forgot password by email works with the email as the name and a wrong code is refused", async () => {
    const user = userEvent.setup();
    loginApp();
    mock.__mock.state.business.loginEmail = "jane@example.com";
    mock.__mock.state.business.loginEmailVerified = true;
    await user.click(await screen.findByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Seller ID or email"), "jane@example.com");
    await user.click(screen.getByRole("radio", { name: /Email/ }));
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText("Code"), "999999");
    await user.type(screen.getByLabelText("New password"), GOOD);
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid or has expired.");
  });
});
