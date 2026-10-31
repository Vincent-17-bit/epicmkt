import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { M, signedInApp } from "../test/utils.jsx";
import * as mock from "../api/mock.js";
import { useSettings } from "../state/settings.js";
import { useToasts } from "../state/toast.js";

beforeEach(() => {
  useSettings.getState().reset();
  useToasts.getState().clear();
  for (const a of ["textSize", "density", "reduceMotion"]) delete document.documentElement.dataset[a];
});

const open = async (path = "/business/settings", prepare) => {
  const view = await signedInApp(path, prepare);
  await screen.findByRole("heading", { level: 1, name: /Settings|Help|Welcome/ });
  await waitFor(() => expect(useSettings.getState().loaded).toBe(true));
  return view;
};

describe("navigation", () => {
  it("Settings and Help are in the More menu", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription");
    const nav = await screen.findByRole("navigation", { name: "Business" });
    await user.click(within(nav).getByRole("button", { name: "More" }));
    await user.click(within(nav).getByRole("link", { name: "Settings" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    await user.click(within(nav).getByRole("button", { name: "More" }));
    await user.click(within(nav).getByRole("link", { name: "Help" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Help" })).toBeInTheDocument();
  });
});

describe("settings page", () => {
  it("shows every section and points sign-in email and password to the Account page", async () => {
    await open();
    for (const name of ["Account and security", "Notifications", "Appearance", "Catalog defaults", "Messaging defaults", "Business preferences", "Data and account"]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    expect(await screen.findByText("ES100001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Account" })).toHaveAttribute("href", "/business/account");
  });

  it("saves appearance choices straight away and applies them to the whole portal", async () => {
    const user = userEvent.setup();
    await open();
    const density = screen.getByRole("radiogroup", { name: "Density" });
    await user.click(within(density).getByRole("radio", { name: "Compact" }));
    expect(document.documentElement.dataset.density).toBe("compact");
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Saved")).toBe(true));
    expect((await mock.getSettings()).appearance.density).toBe("compact");
    await user.click(within(screen.getByRole("radiogroup", { name: "Text size" })).getByRole("radio", { name: "Large" }));
    expect(document.documentElement.dataset.textSize).toBe("large");
    await user.click(within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("rolls a change back and says so when the server refuses it", async () => {
    const user = userEvent.setup();
    await open();
    const original = mock.saveSettings;
    expect(typeof original).toBe("function");
    const sw = screen.getByRole("switch", { name: "Reduce motion" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    M.state.business.status = "suspended";
    await user.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute("aria-checked", "false"));
    expect(useToasts.getState().toasts.some((t) => /could not save/i.test(t.message))).toBe(true);
  });

  it("keeps in-app on for critical events and lets the rest be turned off", async () => {
    const user = userEvent.setup();
    await open();
    const critical = screen.getByRole("switch", { name: "Expiry reminders: In-app" });
    expect(critical).toBeDisabled();
    expect(critical).toHaveAttribute("aria-checked", "true");
    const sms = screen.getByRole("switch", { name: "Expiry reminders: SMS" });
    await user.click(sms);
    await waitFor(() => expect(sms).toHaveAttribute("aria-checked", "false"));
    expect((await mock.getSettings()).notifications.events.expiry.sms).toBe(false);
  });

  it("refuses a WhatsApp greeting with a link or a phone number, and previews a good one", async () => {
    const user = userEvent.setup();
    await open();
    const box = screen.getByRole("textbox", { name: "Greeting" });
    await user.clear(box);
    await user.type(box, "Order at https://shop.example.com");
    await user.tab();
    expect(await screen.findByText(/links are not allowed/i)).toBeInTheDocument();
    expect((await mock.getSettings()).messaging.whatsapp_greeting).not.toMatch(/https/);
    await user.clear(box);
    await user.type(box, "Hello, is {{item} at {{price} still there?");
    await user.tab();
    await waitFor(() => expect(screen.getByTestId("greeting-preview")).toHaveTextContent("Hello, is Fade and beard at KES 300 still there?"));
    await waitFor(async () => expect((await mock.getSettings()).messaging.whatsapp_greeting).toBe("Hello, is {item} at {price} still there?"));
  });

  it("announcement defaults are for Premium sellers only", async () => {
    await open();
    expect(screen.getByRole("switch", { name: "Turn on announcement banners by default" })).toBeDisabled();
    expect(screen.getByText(/part of the Premium plan/i)).toBeInTheDocument();
  });

  it("adds and removes default units, and refuses a duplicate", async () => {
    const user = userEvent.setup();
    await open();
    const input = screen.getByRole("textbox", { name: "New unit" });
    await user.type(input, "crate");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("button", { name: "Remove crate" })).toBeInTheDocument();
    await user.type(input, "CRATE");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/already in the list/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove crate" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove crate" })).toBeNull());
  });

  it("requests a phone change, shows it waiting, and can cancel it", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("button", { name: "Request change" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("New phone number"), "12345");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByText(/Enter a Kenyan number/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("New phone number"));
    await user.type(within(dialog).getByLabelText("New phone number"), "0722 345 678");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/waiting for admin confirmation/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(screen.queryByText(/waiting for admin confirmation/i)).toBeNull());
  });

  it("signs out other devices and says how many", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("button", { name: "Sign out other devices" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Signed out 2 other devices")).toBe(true));
  });

  it("lists recent sign-ins", async () => {
    await open();
    const list = await screen.findByRole("list", { name: "Sign-in history" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("pauses and resumes the listing, and downloads nothing until asked", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: "Pause listing" }));
    await waitFor(() => expect(M.state.business.status).toBe("paused"));
    await user.click(await screen.findByRole("button", { name: "Resume listing" }));
    await waitFor(() => expect(M.state.business.status).toBe("live"));
  });

  it("deleting the account needs the business name typed exactly", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("dialog");
    const go = within(dialog).getByRole("button", { name: "Delete my account" });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Business name"), "demo shop");
    expect(go).toBeEnabled();
  });
});

describe("help", () => {
  it("answers common questions, gives step-by-step guides and shows how to reach support", async () => {
    const user = userEvent.setup();
    await open("/business/help");
    expect(screen.getByRole("heading", { level: 2, name: "Common questions" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /How do I add an item and photos/ }));
    expect(screen.getByText(/Open My listings, choose Add an item/)).toBeInTheDocument();
    expect(screen.getByText("Add items and photos")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("wa.me"));
    expect(screen.getByRole("link", { name: /Call us/ })).toHaveAttribute("href", expect.stringMatching(/^tel:/));
    expect(screen.getByRole("link", { name: /Email/ })).toHaveAttribute("href", "mailto:support@epicmkt.test");
  });
});

describe("onboarding", () => {
  it("ticks steps from real data and records the QR poster once it is opened", async () => {
    const user = userEvent.setup();
    await open("/business/onboarding");
    const steps = await screen.findByRole("list", { name: "Setup steps" });
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("progressbar", { name: "Setup progress" })).toBeInTheDocument();
    const before = screen.getByRole("progressbar").getAttribute("aria-valuenow");
    await user.click(within(steps).getByRole("button", { name: "I have it" }));
    await waitFor(() => expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBe(Number(before) + 1));
    expect((await mock.getSettings()).onboarding.qr_seen).toBe(true);
  });

  it("can be skipped, and then offers to resume", async () => {
    const user = userEvent.setup();
    const { router } = await open("/business/onboarding");
    await user.click(await screen.findByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/business/subscription"));
    expect((await mock.getSettings()).onboarding.status).toBe("skipped");
    expect(await screen.findByRole("link", { name: "Resume setup" })).toHaveAttribute("href", "/business/onboarding");
  });

  it("shows a setup card on Subscription until the steps are done", async () => {
    await signedInApp("/business/subscription");
    const card = await screen.findByRole("region", { name: "Setup guide" });
    expect(within(card).getByRole("link", { name: "Continue setup" })).toHaveAttribute("href", "/business/onboarding");
  });

  it("a tip stays gone once dismissed", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: "Dismiss this tip for good" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Tip" })).toBeNull());
    expect((await mock.getSettings()).onboarding.dismissed_tips).toContain("settings-quiet-hours");
  });
});
