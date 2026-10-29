import { describe, it, expect } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App.jsx";
import * as mock from "../api/mock.js";
import { M, signedInApp } from "../test/utils.jsx";

const where = (router) => router.state.location.pathname;

describe("opening the seller site", () => {
  it("lands on My listings, not Subscription", async () => {
    const { router } = await signedInApp("/business");
    expect(await screen.findByRole("heading", { level: 1, name: "My listings" })).toBeInTheDocument();
    expect(where(router)).toBe("/business/catalog");
  });

  it("any address the site does not know also lands on My listings", async () => {
    const { router } = await signedInApp("/somewhere/else");
    expect(await screen.findByRole("heading", { level: 1, name: "My listings" })).toBeInTheDocument();
    expect(where(router)).toBe("/business/catalog");
  });

  it("a suspended seller cannot open My listings, so lands on Notifications", async () => {
    const { router } = await signedInApp("/business", () => { M.state.business.status = "suspended"; });
    await screen.findByTestId("suspended-banner");
    await waitFor(() => expect(where(router)).toBe("/business/notifications"));
  });

  it("signing in lands on My listings", async () => {
    const user = userEvent.setup();
    mock.resetMock();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/login"]}><App /></MemoryRouter>
      </QueryClientProvider>,
    );
    await user.type(await screen.findByLabelText("Seller ID or email"), "ES100001");
    await user.type(screen.getByLabelText("Password"), "Demo-Passw0rd");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { level: 1, name: "My listings" })).toBeInTheDocument();
  });
});

describe("the shop logo in the header", () => {
  it("opens My listings from any page", async () => {
    const user = userEvent.setup();
    const { router } = await signedInApp("/business/subscription");
    const logo = (await screen.findByTestId("shop-name")).closest("a");
    expect(logo).toHaveAttribute("href", "/business/catalog");
    await user.click(logo);
    expect(await screen.findByRole("heading", { level: 1, name: "My listings" })).toBeInTheDocument();
    expect(where(router)).toBe("/business/catalog");
  });

  it("opens My listings from Account and Notifications too", async () => {
    const user = userEvent.setup();
    for (const path of ["/business/account", "/business/notifications"]) {
      const { router, unmount } = await signedInApp(path);
      await user.click((await screen.findByTestId("shop-name")).closest("a"));
      await waitFor(() => expect(where(router)).toBe("/business/catalog"));
      unmount();
    }
  });

  it("goes to Notifications for a suspended seller, who cannot open My listings", async () => {
    await signedInApp("/business/notifications", () => { M.state.business.status = "suspended"; });
    expect((await screen.findByTestId("shop-name")).closest("a")).toHaveAttribute("href", "/business/notifications");
  });

  it("is still a link to My listings while the nav also has My listings", async () => {
    await signedInApp("/business/catalog");
    const nav = within(await screen.findByRole("navigation", { name: "Business" }));
    expect(nav.getByRole("link", { name: /My listings/ })).toHaveAttribute("href", "/business/catalog");
  });
});
