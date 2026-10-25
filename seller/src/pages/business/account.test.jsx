import { describe, it, expect } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { M, signedInApp } from "../../test/utils.jsx";

describe("shop name", () => {
  it("shows the shop name in the header on every page", async () => {
    await signedInApp("/business/subscription");
    expect(await screen.findByTestId("shop-name")).toHaveTextContent("Demo Shop");
  });
});

describe("strike notice", () => {
  it("is not shown as a banner at the top of the page", async () => {
    await signedInApp("/business/subscription", () => { M.state.business.strikes = 1; });
    await screen.findByTestId("shop-name");
    expect(screen.queryByTestId("strike-banner")).toBeNull();
  });

  it("the Account page still says what strikes can cost", async () => {
    await signedInApp("/business/account", () => { M.state.business.strikes = 1; });
    expect(await screen.findByTestId("acc-strikes")).toHaveTextContent("You have 1 strike");
  });
});

describe("navigation", () => {
  it("has the Account link and More toggles the extra links", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription");
    const nav = await screen.findByRole("navigation", { name: "Business" });
    const more = within(nav).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    await user.click(within(nav).getByRole("link", { name: "Account" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
  });

  it("a suspended seller only has Notifications and Questions", async () => {
    await signedInApp("/business/questions", () => { M.state.business.status = "suspended"; });
    const nav = await screen.findByRole("navigation", { name: "Business" });
    expect(within(nav).queryByRole("button", { name: "More" })).toBeNull();
    expect(within(nav).queryByRole("link", { name: "Account" })).toBeNull();
    expect(within(nav).getByRole("link", { name: /Notifications/ })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Questions" })).toBeInTheDocument();
  });
});

describe("account page", () => {
  it("shows the shop details and the strike count", async () => {
    await signedInApp("/business/account", () => { M.state.business.strikes = 2; });
    expect(await screen.findByTestId("acc-name")).toHaveTextContent("Demo Shop");
    expect(screen.getByTestId("acc-seller-id")).toHaveTextContent("ES100001");
    expect(screen.getByTestId("acc-strikes")).toHaveTextContent("You have 2 strikes.");
  });

  it("changes the password with the SMS code", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    await user.click(await screen.findByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText("Code from SMS"), "123456");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Use at least 10 characters.");
    await user.clear(screen.getByLabelText("New password"));
    await user.type(screen.getByLabelText("New password"), "Brand-New-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Your password was changed."));
  });

  it("rejects a wrong code", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    await user.click(await screen.findByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText("Code from SMS"), "000000");
    await user.type(screen.getByLabelText("New password"), "Brand-New-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid or has expired.");
  });
});
