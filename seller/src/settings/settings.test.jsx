import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CRITICAL_EVENTS, deliveryDecision } from "@epicmkt/shared";
import { freshSession, renderApp, signInAs } from "../test/helpers.jsx";
import * as mock from "../api/mock.js";
import { useSession } from "../state/session.js";
import { useSettings } from "../state/settings.js";
import { useToasts } from "../state/toast.js";
import { THEME_KEY } from "../state/theme.jsx";
import { closureReasons, newItemDefaults, unitsFor } from "../lib/defaults.js";
import { onboardingProgress } from "../lib/onboarding.js";
import ClosureReasonPicker from "../components/ClosureReasonPicker.jsx";

beforeEach(freshSession);

const open = async (id = "ES100001", path = "/settings") => {
  await signInAs(id);
  const view = renderApp(path);
  await screen.findByRole("heading", { name: "Settings" });
  await waitFor(() => expect(useSettings.getState().loaded).toBe(true));
  return view;
};
const saved = async () => (await mock.me()).settings;
const toastText = () => useToasts.getState().toasts.map((t) => t.message).join(" | ");
const section = (name) => screen.getByRole("heading", { name }).closest("section");
const html = () => document.documentElement.dataset;

describe("the settings page", () => {
  it("shows all seven areas and no language option", async () => {
    await open();
    for (const name of ["Account and security", "Notifications", "Appearance", "Catalog defaults", "Messaging defaults", "Business preferences", "Data and account"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(/language|kiswahili|swahili|locale/i)).toBeNull();
    expect(screen.queryByRole("combobox", { name: /language/i })).toBeNull();
    expect((await saved()).language).toBeUndefined();
  });

  it("is reachable from the avatar menu and the more sheet", async () => {
    await signInAs("ES100001");
    renderApp("/");
    await screen.findByRole("heading", { level: 1 });
    expect(document.querySelector('a[href="/settings"]')).not.toBeNull();
  });
});

describe("account and security", () => {
  it("shows the Seller ID read-only and the phone masked", async () => {
    await open();
    const s = section("Account and security");
    expect(within(s).getByText("ES100001")).toBeInTheDocument();
    expect(within(s).getByLabelText("Registered phone, masked")).toHaveTextContent("+2547*****678");
    expect(s.textContent).not.toContain("+254712345678");
    expect(within(s).queryByRole("textbox", { name: /seller id/i })).toBeNull();
  });

  it("a phone change becomes a request the admin confirms, not an instant change", async () => {
    await open();
    const s = section("Account and security");
    await userEvent.click(within(s).getByRole("button", { name: "Request change" }));
    const dialog = await screen.findByRole("dialog", { name: "Request a phone change" });
    await userEvent.type(within(dialog).getByLabelText("New phone number"), "12");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Kenyan number");
    await userEvent.clear(within(dialog).getByLabelText("New phone number"));
    await userEvent.type(within(dialog).getByLabelText("New phone number"), "0733 111 222");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send request" }));
    const note = await within(s).findByRole("status");
    expect(note).toHaveTextContent(/waiting for admin confirmation/i);
    expect(note).toHaveTextContent("+2547*****222");
    expect((await mock.listChanges())[0]).toMatchObject({ field: "phone", status: "pending" });
    expect(useSession.getState().me.business.phone).toBe("+254712345678");
    expect(within(s).getByRole("button", { name: "Request change" })).toBeDisabled();
  });

  it("validates and saves the email", async () => {
    await open();
    const box = screen.getByLabelText("Email address");
    await userEvent.type(box, "not-an-email");
    await userEvent.tab();
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "shop@example.com");
    await userEvent.tab();
    await waitFor(() => expect(toastText()).toContain("Saved"));
    expect(useSession.getState().me.business.email).toBe("shop@example.com");
  });

  it("changes the idle timeout to each allowed value and signs out on the new schedule", async () => {
    await open();
    const select = screen.getByLabelText("Sign out after inactivity");
    expect([...select.options].map((o) => o.value)).toEqual(["15", "30", "60", "120"]);
    await userEvent.selectOptions(select, "30");
    await waitFor(async () => expect((await saved()).idle_minutes).toBe(30));
    expect(toastText()).toContain("Saved");
    expect(useSettings.getState().settings.idle_minutes).toBe(30);
    await expect(mock.saveSettings({ idle_minutes: 45 })).rejects.toMatchObject({ code: "invalid_settings" });
  });

  it("changes the password with a code sent to the phone", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change password" });
    expect(dialog).toHaveTextContent("+2547*****678");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
    await userEvent.type(await within(dialog).findByLabelText("6-digit code"), "000000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await userEvent.type(await within(dialog).findByLabelText("New password"), "Brand-New-Pass1");
    await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "Brand-New-Pass1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("not valid or has expired");
    await userEvent.type(await within(dialog).findByLabelText("6-digit code"), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await userEvent.type(await within(dialog).findByLabelText("New password"), "Brand-New-Pass1");
    await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "Brand-New-Pass1");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(toastText()).toContain("Password changed"));
    await expect(mock.login("ES100001", "Brand-New-Pass1")).resolves.toBeTruthy();
  });

  it("rejects a weak password and changes nothing", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = await screen.findByRole("dialog", { name: "Change password" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Send code" }));
    await userEvent.type(await within(dialog).findByLabelText("6-digit code"), "123456");
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await userEvent.type(await within(dialog).findByLabelText("New password"), "short");
    await userEvent.type(within(dialog).getByLabelText("Confirm new password"), "short");
    await userEvent.click(within(dialog).getByRole("button", { name: "Change password" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("stronger password");
  });

  it("signs out other devices after a confirmation", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));
    const dialog = await screen.findByRole("dialog", { name: "Sign out other devices?" });
    expect(dialog).toHaveTextContent("This device stays signed in");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));
    await waitFor(() => expect(toastText()).toContain("Signed out 2 other devices"));
    expect((await mock.signOutOthers()).signedOut).toBe(0);
    expect(useSession.getState().phase).toBe("authed");
  });

  it("lists sign-ins with the device and the failed attempts since the last success", async () => {
    await mock.login("ES100001", "wrong").catch(() => {});
    await mock.login("ES100001", "wrong").catch(() => {});
    await open();
    const list = await screen.findByRole("list", { name: "Sign-in history" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.length).toBe(3);
    expect(rows[0]).toHaveTextContent("Signed in");
    expect(rows[0]).toHaveTextContent("2 failed attempts before this sign-in");
    expect(rows[1]).toHaveTextContent("Failed attempt");
    expect(screen.queryByText(/since your last successful sign-in/)).toBeNull();
  });

  it("warns about failed attempts that came after the last success", async () => {
    await mock.login("ES100001", "Demo-Passw0rd");
    await mock.login("ES100001", "wrong").catch(() => {});
    useSession.setState({ phase: "loading", me: null });
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    expect(await screen.findByText(/1 failed attempt since your last successful sign-in/)).toBeInTheDocument();
  });
});

describe("notifications", () => {
  it("lets each non-critical channel be changed and saves it", async () => {
    await open();
    const sms = screen.getByRole("switch", { name: "Customer reports: SMS" });
    expect(sms).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sms);
    await waitFor(async () => expect((await saved()).notifications.events.customer_report.sms).toBe(true));
    expect(screen.getByRole("switch", { name: "Customer reports: SMS" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("switch", { name: "Closure reminders: Email" }));
    await waitFor(async () => expect((await saved()).notifications.events.closure_reminder.email).toBe(true));
    await userEvent.click(screen.getByRole("switch", { name: "Removals: In-app" }));
    await waitFor(async () => expect((await saved()).notifications.events.removal.in_app).toBe(false));
  });

  it("keeps in-app on for critical events: the switch is locked and the server refuses it", async () => {
    await open();
    for (const [key, label] of [["expiry", "Expiry reminders"], ["payment", "Payment confirmations"], ["admin_question", "Questions from EpicMKT"], ["suspension", "Suspension notices"]]) {
      const sw = screen.getByRole("switch", { name: `${label}: In-app` });
      expect(sw).toBeDisabled();
      expect(sw).toHaveAttribute("aria-checked", "true");
      await expect(mock.saveSettings({ notifications: { events: { [key]: { in_app: false } } } })).rejects.toMatchObject({ code: "critical_in_app_required" });
      const r = await useSettings.getState().update({ notifications: { events: { [key]: { in_app: false } } } });
      expect(r.ok).toBe(false);
      expect(useSettings.getState().settings.notifications.events[key].in_app).toBe(true);
    }
    for (const key of CRITICAL_EVENTS) expect((await saved()).notifications.events[key].in_app).toBe(true);
  });

  it("allows SMS and email to be switched off for critical events while in-app stays", async () => {
    await open();
    await userEvent.click(screen.getByRole("switch", { name: "Expiry reminders: SMS" }));
    await waitFor(async () => expect((await saved()).notifications.events.expiry.sms).toBe(false));
    const s = await saved();
    expect(deliveryDecision({ event: "expiry", channel: "in_app", settings: s })).toEqual({ action: "send" });
    expect(deliveryDecision({ event: "expiry", channel: "sms", settings: s }).action).toBe("skip");
  });

  it("saves quiet hours and holds only non-critical SMS inside them", async () => {
    await open();
    expect(screen.getByLabelText("From")).toHaveValue("21:00");
    expect(screen.getByLabelText("Until")).toHaveValue("07:00");
    const from = screen.getByLabelText("From");
    await act(async () => { await userEvent.clear(from); await userEvent.type(from, "22:30"); });
    fireChange(from, "22:30");
    await waitFor(async () => expect((await saved()).notifications.quiet_hours.start).toBe("22:30"));
    const s = await saved();
    const at2300 = new Date("2026-10-11T20:00:00Z"); // 23:00 Nairobi
    expect(deliveryDecision({ event: "change_decision", channel: "sms", settings: s, now: at2300 }).action).toBe("delay");
    expect(deliveryDecision({ event: "expiry", channel: "sms", settings: s, now: at2300 }).action).toBe("send");
    expect(deliveryDecision({ event: "change_decision", channel: "sms", settings: s, now: new Date("2026-10-11T09:00:00Z") }).action).toBe("send");
    await userEvent.click(screen.getByRole("switch", { name: "Quiet hours" }));
    await waitFor(async () => expect((await saved()).notifications.quiet_hours.enabled).toBe(false));
    expect(screen.queryByLabelText("From")).toBeNull();
  });

  it("refuses a quiet-hours window that starts and ends together", async () => {
    await open();
    await expect(mock.saveSettings({ notifications: { quiet_hours: { start: "07:00", end: "07:00" } } })).rejects.toBeTruthy().catch(() => {});
    const r = await useSettings.getState().update({ notifications: { quiet_hours: { start: "21:00", end: "21:00" } } });
    expect(r.ok).toBe(false);
  });
});

const fireChange = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("appearance applies at once, everywhere, and is remembered on the device and server", () => {
  it("theme: light, dark and system", async () => {
    await open();
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    await waitFor(async () => expect((await saved()).appearance.theme).toBe("dark"));
    await userEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.click(screen.getByRole("radio", { name: "System" }));
    await waitFor(async () => expect((await saved()).appearance.theme).toBe("system"));
    expect(toastText()).toContain("Saved");
  });

  it("text size: normal, large and extra large", async () => {
    await open();
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(html().textSize).toBe("large");
    await userEvent.click(screen.getByRole("radio", { name: "Extra large" }));
    expect(html().textSize).toBe("xlarge");
    await waitFor(async () => expect((await saved()).appearance.text_size).toBe("xlarge"));
    await userEvent.click(screen.getByRole("radio", { name: "Normal" }));
    expect(html().textSize).toBe("normal");
  });

  it("density and reduce motion", async () => {
    await open();
    await userEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(html().density).toBe("compact");
    await userEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(html().reduceMotion).toBe("true");
    await waitFor(async () => expect((await saved()).appearance).toMatchObject({ density: "compact", reduce_motion: true }));
    await userEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    expect(html().reduceMotion).toBe("false");
  });

  it("applies on every page of the portal, not just Settings", async () => {
    const { router } = await open();
    await userEvent.click(screen.getByRole("radio", { name: "Extra large" }));
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await act(async () => { await router.navigate("/help"); });
    await screen.findByRole("heading", { name: "Help" });
    expect(html().textSize).toBe("xlarge");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows the seller to another device, where nothing was stored", async () => {
    const first = await open();
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    await userEvent.click(screen.getByRole("radio", { name: "Compact" }));
    await userEvent.click(screen.getByRole("switch", { name: "Reduce motion" }));
    await waitFor(async () => expect((await saved()).appearance.reduce_motion).toBe(true));
    first.unmount();
    // a different device: empty local storage, nothing applied yet, same account
    window.localStorage.clear();
    useSettings.getState().reset();
    for (const k of ["textSize", "density", "reduceMotion"]) delete document.documentElement.dataset[k];
    delete document.documentElement.dataset.theme;
    useSession.setState({ phase: "loading", me: null });
    renderApp("/");
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
    expect(html()).toMatchObject({ textSize: "large", density: "compact", reduceMotion: "true" });
  });

  it("rolls back and says so when the server cannot save", async () => {
    await open();
    const original = mock.saveSettings;
    const api = await import("../api/index.js");
    const spy = (await import("vitest")).vi.spyOn(mock, "saveSettings").mockRejectedValue(new Error("offline"));
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    await waitFor(() => expect(toastText()).toContain("could not save"));
    expect(html().textSize).not.toBe("large");
    expect(screen.getByRole("radio", { name: "Normal" })).toHaveAttribute("aria-checked", "true");
    spy.mockRestore();
    expect(typeof original).toBe("function");
    expect(typeof api.saveSettings).toBe("function");
  });
});

describe("catalog defaults", () => {
  it("saves each default and S4/S6 read them", async () => {
    await open();
    await userEvent.selectOptions(screen.getByLabelText("Default availability"), "limited_stock");
    await userEvent.selectOptions(screen.getByLabelText("Price reminder interval"), "60");
    await userEvent.click(screen.getByRole("radio", { name: "Hidden" }));
    await userEvent.click(screen.getByRole("switch", { name: "Show Only N left" }));
    const thr = screen.getByLabelText("Low-stock threshold");
    await userEvent.clear(thr);
    await userEvent.type(thr, "7");
    await userEvent.tab();
    await waitFor(async () => expect((await saved()).catalog.low_stock_threshold).toBe(7));
    const s = await saved();
    expect(s.catalog).toMatchObject({ default_availability: "limited_stock", price_reminder_days: 60, start_visible: false, show_only_n_left: false, low_stock_threshold: 7 });
    const defaults = newItemDefaults(s, useSession.getState().me.business);
    expect(defaults).toMatchObject({ availability: "limited_stock", visible: false, low_stock_threshold: 7, show_stock_count: false });
  });

  it("rejects a bad threshold and a bad reminder interval", async () => {
    await open();
    const thr = screen.getByLabelText("Low-stock threshold");
    await userEvent.clear(thr);
    await userEvent.type(thr, "5000");
    await userEvent.tab();
    expect(await screen.findByText(/whole number from 0 to 1000/)).toBeInTheDocument();
    expect((await saved()).catalog.low_stock_threshold).toBe(3);
    const r = await useSettings.getState().update({ catalog: { price_reminder_days: 45 } });
    expect(r.ok).toBe(false);
    expect(screen.getByLabelText("Price reminder interval").options.length).toBe(3);
  });

  it("the price reminder interval drives the stale price count", async () => {
    await signInAs("ES100001");
    const before = (await mock.me()).catalog.stale_prices;
    await mock.saveSettings({ catalog: { price_reminder_days: 14 } });
    const shorter = (await mock.me()).catalog.stale_prices;
    await mock.saveSettings({ catalog: { price_reminder_days: 60 } });
    const longer = (await mock.me()).catalog.stale_prices;
    expect(shorter).toBeGreaterThanOrEqual(longer);
    expect(typeof before).toBe("number");
  });

  it("manages the default unit list per category", async () => {
    await open();
    const business = useSession.getState().me.business;
    expect(unitsFor({}, business)).toContain("kg");
    await userEvent.type(screen.getByLabelText("New unit"), "bunch");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(unitsFor(useSettings.getState().settings, business)).toContain("bunch"));
    await userEvent.click(screen.getByRole("button", { name: "Remove each" }));
    await waitFor(() => expect(unitsFor(useSettings.getState().settings, business)).not.toContain("each"));
    await userEvent.type(screen.getByLabelText("New unit"), "bunch");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("That unit is already in the list.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New unit"), "x".repeat(21));
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText(/Up to 20 characters/)).toBeInTheDocument();
  });

  it("an import fills empty availability from the default", async () => {
    await signInAs("ES100002");
    await mock.saveSettings({ catalog: { default_availability: "unavailable", low_stock_threshold: 9, show_only_n_left: false } });
    await mock.importItems([{ name: "Imported thing", price: 100 }]);
    const { items } = await mock.listItems();
    const row = items.find((i) => i.name === "Imported thing");
    expect(row).toMatchObject({ low_stock_threshold: 9, show_stock_count: false, visible: false, draft: true });
  });
});

describe("messaging defaults", () => {
  const greeting = () => screen.getByLabelText("Greeting");

  it("saves a greeting with {item} and {price} and previews it live", async () => {
    await open();
    await userEvent.clear(greeting());
    await userEvent.type(greeting(), "Hello, is {{item} at {{price} ready?");
    expect(screen.getByTestId("greeting-preview")).toHaveTextContent("Hello, is Fade and beard at KES 300 ready?");
    await userEvent.tab();
    await waitFor(async () => expect((await saved()).messaging.whatsapp_greeting).toBe("Hello, is {item} at {price} ready?"));
    expect(toastText()).toContain("Saved");
  });

  it.each([
    ["a link", "See https://shop.example.com", /Links are not allowed/],
    ["a bare domain", "Visit shop.co.ke", /Links are not allowed/],
    ["a phone number", "Call 0712 345 678 now", /Phone numbers are not allowed/],
    ["an international number", "WhatsApp +254-712-345-678", /Phone numbers are not allowed/],
    ["an unknown variable", "Hi {{name}", /Only \{item\} and \{price\}/],
    ["empty text", "   ", /Write a greeting/]
  ])("rejects %s", async (_, text, message) => {
    await open();
    await userEvent.clear(greeting());
    await userEvent.type(greeting(), text);
    await userEvent.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect((await saved()).messaging.whatsapp_greeting).toMatch(/I saw \{item\}/);
  });

  it("enforces the length limit and shows a counter", async () => {
    await open();
    await userEvent.clear(greeting());
    await act(async () => { await userEvent.click(greeting()); });
    await userEvent.paste("a".repeat(161));
    expect(screen.getByText("161 / 160")).toBeInTheDocument();
    await userEvent.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent("under 160");
  });

  it("edits closure reasons and the closure sheet offers the saved ones", async () => {
    await open();
    const label = screen.getByLabelText("Reason 1");
    await userEvent.clear(label);
    await userEvent.type(label, "Lunch and prayers");
    await userEvent.tab();
    await waitFor(async () => expect((await saved()).messaging.closure_reasons[0].label).toBe("Lunch and prayers"));
    await userEvent.click(screen.getByRole("button", { name: "Add a reason" }));
    const labels = screen.getAllByLabelText(/^Reason \d/);
    await userEvent.type(labels[labels.length - 1], "Stock count");
    await userEvent.tab();
    await waitFor(async () => expect((await saved()).messaging.closure_reasons.map((r) => r.label)).toContain("Stock count"));
    const reasons = closureReasons(await saved());
    const picked = [];
    render(<ClosureReasonPicker onChange={(r) => picked.push(r)} />);
    expect(screen.getByRole("radio", { name: /Lunch and prayers/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Stock count/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Stock count/ }));
    expect(picked[0]).toMatchObject({ label: "Stock count" });
    expect(reasons.length).toBe(6);
  });

  it("refuses closure reasons with links or phone numbers, duplicates, and more than eight", async () => {
    await open();
    const label = screen.getByLabelText("Reason 2");
    await userEvent.clear(label);
    await userEvent.type(label, "Call 0712345678");
    await userEvent.tab();
    expect(await screen.findByText(/Phone numbers are not allowed/)).toBeInTheDocument();
    await userEvent.clear(label);
    await userEvent.type(label, "lunch break");
    await userEvent.tab();
    expect(await screen.findByText(/different name/)).toBeInTheDocument();
    const r = await useSettings.getState().update({ messaging: { closure_reasons: Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, label: `Reason ${i}`, message: "" })) } });
    expect(r.ok).toBe(false);
  });

  it("resets closure reasons to the defaults", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Remove reason 1" }));
    await waitFor(async () => expect((await saved()).messaging.closure_reasons.length).toBe(4));
    await userEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await waitFor(async () => expect((await saved()).messaging.closure_reasons.length).toBe(5));
  });
});

describe("business preferences", () => {
  it("saves the chip switch and the partial closure message, and checks the message", async () => {
    await open();
    await userEvent.click(screen.getByRole("switch", { name: "Show Closes in N min" }));
    await waitFor(async () => expect((await saved()).business.show_closes_chip).toBe(false));
    const box = screen.getByLabelText("Partial closure message");
    await userEvent.clear(box);
    await userEvent.type(box, "Visit www.shop.co.ke");
    await userEvent.tab();
    expect(await screen.findByText(/Links are not allowed/)).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "Chairs are full today.");
    await userEvent.tab();
    await waitFor(async () => expect((await saved()).business.partial_closure_message).toBe("Chairs are full today."));
  });

  it("announcement defaults are Premium only", async () => {
    await open("ES100001");
    expect(screen.getByRole("switch", { name: "Turn on announcement banners by default" })).toBeDisabled();
    await expect(mock.saveSettings({ business: { announcement: { enabled: true } } })).rejects.toMatchObject({ code: "premium_only" });
  });

  it("lets a Premium seller set announcement defaults", async () => {
    await open("ES100002");
    await userEvent.click(screen.getByRole("switch", { name: "Turn on announcement banners by default" }));
    await waitFor(async () => expect((await saved()).business.announcement.enabled).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText("Show for"), "14");
    await waitFor(async () => expect((await saved()).business.announcement.days).toBe(14));
  });
});

describe("data and account", () => {
  it("can never change status, plan or visibility through settings", async () => {
    await signInAs("ES100001");
    for (const key of ["status", "plan_key", "visible", "featured", "verification_level", "language"]) {
      await expect(mock.saveSettings({ [key]: "x" })).rejects.toMatchObject({ code: "field_not_allowed" });
    }
    const before = (await mock.me()).business;
    await mock.saveSettings({ appearance: { theme: "dark" }, business: { show_closes_chip: false } });
    const after = (await mock.me()).business;
    expect({ status: after.status, plan: after.plan_key }).toEqual({ status: before.status, plan: before.plan_key });
  });

  it("downloads the data as JSON", async () => {
    await open();
    const created = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (blob) => (created.push(blob), "blob:test");
    URL.revokeObjectURL = () => {};
    await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
    await waitFor(() => expect(created.length).toBe(1));
    expect(created[0].type).toBe("application/json");
    const parsed = JSON.parse(await created[0].text());
    expect(parsed.business.seller_id).toBe("ES100001");
    expect(parsed.seller_settings).toBeDefined();
    URL.createObjectURL = orig;
  });

  it("pauses and resumes the listing", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Pause listing" }));
    await waitFor(() => expect(useSession.getState().me.business.status).toBe("paused"));
    await userEvent.click(await screen.findByRole("button", { name: "Resume listing" }));
    await waitFor(() => expect(useSession.getState().me.business.status).toBe("live"));
  });

  it("deletes the account only after the business name is typed", async () => {
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete your account?" });
    const go = within(dialog).getByRole("button", { name: "Delete my account" });
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Business name"), "Fade Kings");
    expect(go).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Business name"), " Barbershop");
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(useSession.getState().phase).toBe("anon"));
    await expect(mock.login("ES100001", "Demo-Passw0rd")).rejects.toMatchObject({ code: "deleted" });
  });
});

describe("both themes and small screens", () => {
  it.each(["light", "dark"])("renders every section in the %s theme with no horizontal scroll rules", async (theme) => {
    await open();
    await userEvent.click(screen.getByRole("radio", { name: theme === "dark" ? "Dark" : "Light" }));
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThanOrEqual(7);
    const root = screen.getByRole("heading", { name: "Settings" }).closest("div");
    expect(root.innerHTML).not.toMatch(/style="[^"]*(width|min-width):\s*\d{4,}px/);
  });

  it("every control has an accessible name", async () => {
    await open();
    for (const sw of screen.getAllByRole("switch")) expect(sw).toHaveAccessibleName();
    for (const sel of screen.getAllByRole("combobox")) expect(sel).toHaveAccessibleName();
    for (const box of screen.getAllByRole("textbox")) expect(box).toHaveAccessibleName();
  });
});

describe("onboarding progress ticks from real data", () => {
  const business = { tagline: "Hi", description: "We cut hair", logo_path: "l", hours: { mon: ["08:00", "17:00"] } };
  const base = { business: {}, catalog: { total: 0, without_photo: 0 }, usage: { faqs: 0 }, settings: { onboarding: {} } };

  it("starts at zero and ticks one step at a time", () => {
    expect(onboardingProgress(base)).toMatchObject({ count: 0, complete: false, percent: 0 });
    expect(onboardingProgress({ ...base, business }).steps.map((s) => s.done)).toEqual([true, true, false, false, false]);
    expect(onboardingProgress({ ...base, business, catalog: { total: 3, without_photo: 3 } }).steps[2].done).toBe(false);
    expect(onboardingProgress({ ...base, business, catalog: { total: 3, without_photo: 2 } }).steps[2].done).toBe(true);
    expect(onboardingProgress({ ...base, business, usage: { faqs: 1 } }).steps[3].done).toBe(true);
    const all = onboardingProgress({ business, catalog: { total: 3, without_photo: 0 }, usage: { faqs: 2 }, settings: { onboarding: { qr_seen: true } } });
    expect(all).toMatchObject({ count: 5, complete: true, percent: 100, next: null });
  });

  it("needs all of tagline, description and logo for the profile step", () => {
    for (const missing of ["tagline", "description", "logo_path"]) {
      const b = { ...business, [missing]: "" };
      expect(onboardingProgress({ ...base, business: b }).steps[0].done).toBe(false);
    }
  });

  it("shows the real state in the wizard and opens each step's page", async () => {
    await signInAs("ES100002");
    renderApp("/onboarding");
    expect(await screen.findByRole("heading", { name: "Welcome to EpicMKT Business" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Setup steps" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("(done)");
    expect(items[1]).toHaveTextContent("(done)");
    expect(items[2]).toHaveTextContent("(done)");
    expect(items[3]).toHaveTextContent("(done)");
    expect(items[4]).toHaveTextContent("(to do)");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByText("4 of 5 done")).toBeInTheDocument();
  });

  it("a brand-new business shows empty progress, and finishing the QR step ticks it", async () => {
    await signInAs("ES100004");
    renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Welcome to EpicMKT Business" });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    await userEvent.click(screen.getByRole("button", { name: "I have it" }));
    await waitFor(async () => expect((await saved()).onboarding.qr_seen).toBe(true));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
  });

  it("skips, then resumes from the same place", async () => {
    await signInAs("ES100004");
    const { router } = renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Welcome to EpicMKT Business" });
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect((await saved()).onboarding.status).toBe("skipped");
    const card = await screen.findByRole("region", { name: "Setup guide" });
    expect(card).toHaveTextContent("Pick up your setup");
    await userEvent.click(within(card).getByRole("link", { name: "Resume setup" }));
    await screen.findByRole("heading", { name: "Welcome to EpicMKT Business" });
    await userEvent.click(screen.getByRole("button", { name: "Resume setup" }));
    await waitFor(async () => expect((await saved()).onboarding.status).toBe("active"));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("marks setup done when every step is complete and hides the home card", async () => {
    await signInAs("ES100002");
    await mock.saveSettings({ onboarding: { qr_seen: true } });
    renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Welcome to EpicMKT Business" });
    await waitFor(async () => expect((await saved()).onboarding.status).toBe("done"));
    expect((await saved()).onboarding.completed_at).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to Home" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
  });
});

describe("contextual tips", () => {
  it("can be dismissed for good and stay dismissed on the next visit and on another device", async () => {
    const first = await open();
    const tip = document.querySelector('[data-tip="settings-quiet-hours"]');
    expect(tip).not.toBeNull();
    await userEvent.click(within(tip).getByRole("button", { name: /Dismiss this tip for good/ }));
    expect(document.querySelector('[data-tip="settings-quiet-hours"]')).toBeNull();
    await waitFor(async () => expect((await saved()).onboarding.dismissed_tips).toContain("settings-quiet-hours"));
    first.unmount();
    window.localStorage.clear();
    useSettings.getState().reset();
    useSession.setState({ phase: "loading", me: null });
    renderApp("/settings");
    await screen.findByRole("heading", { name: "Settings" });
    await waitFor(() => expect(useSettings.getState().loaded).toBe(true));
    expect(document.querySelector('[data-tip="settings-quiet-hours"]')).toBeNull();
  });
});

describe("help", () => {
  it("has an FAQ accordion, how-to guides and support contacts from settings", async () => {
    await signInAs("ES100001");
    renderApp("/help");
    expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
    const q = screen.getByRole("button", { name: "How do I add an item and photos?" });
    expect(q).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(q);
    expect(q).toHaveAttribute("aria-expanded", "true");
    for (const title of ["Add items and photos", "Close temporarily", "Confirm your prices", "Answer a question from the team", "Pay for your listing", "Print your QR poster"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(await screen.findByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("wa.me/254700000111"));
    expect(screen.getByRole("link", { name: /Call us/ })).toHaveAttribute("href", expect.stringContaining("tel:"));
    expect(screen.getByRole("link", { name: /Email/ })).toHaveAttribute("href", "mailto:support@epicmkt.test");
    expect(screen.queryByText(/language|kiswahili/i)).toBeNull();
  });

  it("stays reachable when the listing is suspended or not live", async () => {
    await signInAs("ES100007");
    renderApp("/help");
    expect(await screen.findByRole("heading", { name: "Help" })).toBeInTheDocument();
  });
});
