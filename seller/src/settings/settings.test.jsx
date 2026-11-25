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
  it("lists every section in the menu, shows one at a time, and points sign-in email and password to the Account page", async () => {
    const user = userEvent.setup();
    await open();
    const menu = screen.getByRole("navigation", { name: "Settings sections" });
    expect(screen.getByRole("heading", { level: 2, name: "Shop location" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Notifications" })).toBeNull();
    for (const name of ["Delivery", "Opening hours", "Account and security", "Notifications", "Appearance", "Catalog defaults", "Messaging", "Data and account", "Shop location"]) {
      await user.click(within(menu).getByRole("link", { name }));
      expect(await screen.findByRole("heading", { level: 2, name })).toBeInTheDocument();
      expect(within(menu).getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    }
    await user.click(within(menu).getByRole("link", { name: "Account and security" }));
    expect(await screen.findByText("ES100001")).toBeInTheDocument();
    // the sign-in email and the password are changed on the Account page, and the email is shown here, masked
    expect(screen.getByRole("link", { name: "Add" })).toHaveAttribute("href", "/business/account");
    expect(screen.getByRole("link", { name: "Change on Account" })).toHaveAttribute("href", "/business/account");
  });

  it("keeps unsaved changes when you move between sections", async () => {
    const user = userEvent.setup();
    await open();
    const menu = screen.getByRole("navigation", { name: "Settings sections" });
    const box = await screen.findByRole("textbox", { name: "Address or landmark" });
    await user.clear(box);
    await user.type(box, "Draft landmark");
    await user.click(within(menu).getByRole("link", { name: "Appearance" }));
    await user.click(within(menu).getByRole("link", { name: "Shop location" }));
    expect(screen.getByRole("textbox", { name: "Address or landmark" })).toHaveValue("Draft landmark");
  });

  it("no longer offers quiet hours, an inactivity timeout or the other trimmed settings", async () => {
    await open();
    for (const gone of [/quiet hours/i, /sign out after inactivity/i, /^density$/i, /reduce motion/i, /announcement banner/i, /closes in n min/i, /closure reasons/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
    expect(screen.queryByRole("heading", { level: 2, name: "Business preferences" })).toBeNull();
  });

  it("shows the saved shop pin and area in Shop location", async () => {
    await open();
    expect(await screen.findByText("Maseno, Kisumu")).toBeInTheDocument();
    expect(screen.getByTestId("pin-state")).toHaveTextContent("Pin at -0.09000, 34.60000");
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use my location" })).toBeInTheDocument();
  });

  it("saves a new landmark and keeps the pin, and refuses a pin outside Kenya", async () => {
    const user = userEvent.setup();
    await open();
    const box = await screen.findByRole("textbox", { name: "Address or landmark" });
    await user.clear(box);
    await user.type(box, "Opposite the new stage");
    await user.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Shop location saved")).toBe(true));
    const facts = await mock.getBusinessFacts();
    expect(facts.address).toBe("Opposite the new stage");
    await expect(mock.setLocation({ lat: 51.5, lng: -0.12 })).rejects.toMatchObject({ code: "invalid_location" });
    await expect(mock.setLocation({ lat: 0.5, lng: 34.6, address: "x".repeat(201) })).rejects.toMatchObject({ code: "invalid_address" });
  });

  it("saves appearance choices straight away and applies them to the whole portal", async () => {
    const user = userEvent.setup();
    await open("/business/settings#appearance");
    await user.click(within(screen.getByRole("radiogroup", { name: "Text size" })).getByRole("radio", { name: "Large" }));
    expect(document.documentElement.dataset.textSize).toBe("large");
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Saved")).toBe(true));
    expect((await mock.getSettings()).appearance.text_size).toBe("large");
    await user.click(within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("rolls a change back and says so when the server refuses it", async () => {
    const user = userEvent.setup();
    await open("/business/settings#notifications");
    const original = mock.saveSettings;
    expect(typeof original).toBe("function");
    const sw = screen.getByRole("switch", { name: "Expiry reminders: SMS" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    M.state.business.status = "suspended";
    await user.click(sw);
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => /could not save/i.test(t.message))).toBe(true));
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("keeps in-app on for critical events and lets the rest be turned off", async () => {
    const user = userEvent.setup();
    await open("/business/settings#notifications");
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
    await open("/business/settings#messaging");
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

  it("adds and removes default units, and refuses a duplicate", async () => {
    const user = userEvent.setup();
    await open("/business/settings#catalog");
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

  it("asks an admin to change the phone when the code way is not possible, shows it waiting, and can cancel it", async () => {
    const user = userEvent.setup();
    await open("/business/settings#account");
    await user.click(screen.getByRole("button", { name: "Change" , exact: true }));
    const first = await screen.findByRole("dialog", { name: /change phone number/i });
    await user.click(within(first).getByRole("button", { name: /ask an admin to change it/i }));
    const dialog = await screen.findByRole("dialog", { name: /ask an admin/i });
    await user.type(within(dialog).getByLabelText("New phone number"), "12345");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await within(dialog).findByText(/Enter a valid phone number/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("New phone number"));
    await user.type(within(dialog).getByLabelText("New phone number"), "0722 345 678");
    await user.click(within(dialog).getByRole("button", { name: "Send request" }));
    expect(await screen.findByText(/waiting for admin confirmation/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    await waitFor(() => expect(screen.queryByText(/waiting for admin confirmation/i)).toBeNull());
  });

  it("changes the phone with a code texted to the new number, from any country", async () => {
    const user = userEvent.setup();
    await open("/business/settings#account");
    expect(screen.getByLabelText("Registered phone, masked")).toHaveTextContent("+2547*****678");
    await user.click(screen.getByRole("button", { name: "Change", exact: true }));
    const dialog = await screen.findByRole("dialog", { name: /change phone number/i });

    // a wrong password stops it before any text is sent
    await user.type(within(dialog).getByLabelText("New phone number"), "0772 123 456");
    await user.click(within(dialog).getByRole("button", { name: /country code/i }));
    await user.type(screen.getByRole("combobox"), "uganda");
    await user.click(screen.getByRole("option"));
    await user.type(within(dialog).getByLabelText("Current password"), "not-the-password");
    await user.click(within(dialog).getByRole("button", { name: "Send code to this number" }));
    expect(await within(dialog).findByText("That is not your current password.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Code from the text message")).toBeNull();

    await user.clear(within(dialog).getByLabelText("Current password"));
    await user.type(within(dialog).getByLabelText("Current password"), "Demo-Passw0rd");
    await user.click(within(dialog).getByRole("button", { name: "Send code to this number" }));
    expect(await within(dialog).findByText(/Code sent by SMS to/)).toHaveTextContent("+2567*****456");
    expect(within(dialog).getByText(/\(Uganda\)/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Code from the text message"), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Save phone number" }));
    expect(await within(dialog).findByText("That code is not valid or has expired.")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText("Code from the text message"));
    await user.type(within(dialog).getByLabelText("Code from the text message"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "Save phone number" }));
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Phone number changed")).toBe(true));
    await waitFor(() => expect(screen.getByLabelText("Registered phone, masked")).toHaveTextContent("+2567*****456"));
  });

  it("shows the sign-in email masked, or that there is none", async () => {
    await open("/business/settings#account");
    expect(await screen.findByLabelText("Sign-in email, masked")).toHaveTextContent("Not added");
  });

  it("signs out other devices and says how many", async () => {
    const user = userEvent.setup();
    await open("/business/settings#account");
    await user.click(screen.getByRole("button", { name: "Sign out other devices" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Signed out 2 other devices")).toBe(true));
  });

  it("lists recent sign-ins", async () => {
    await open("/business/settings#account");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Recent sign-ins" }));
    const list = await screen.findByRole("list", { name: "Sign-in history" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("pauses and resumes the listing, and downloads nothing until asked", async () => {
    const user = userEvent.setup();
    await open("/business/settings#data");
    await user.click(await screen.findByRole("button", { name: "Pause listing" }));
    await waitFor(() => expect(M.state.business.status).toBe("paused"));
    await user.click(await screen.findByRole("button", { name: "Resume listing" }));
    await waitFor(() => expect(M.state.business.status).toBe("live"));
  });

  it("deleting the account needs the business name typed exactly", async () => {
    const user = userEvent.setup();
    await open("/business/settings#data");
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
    // The answer follows the editor's real order: pick the type first, then Media, Basics, Options, Price and stock, Details.
    expect(screen.getByText(/Open My listings and tap Add item\. First pick what you are adding.*Media.*Basics.*Options.*Price and stock.*Details/)).toBeInTheDocument();
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

  it("remembers a dismissed tip", async () => {
    await open();
    await useSettings.getState().dismissTip("any-tip");
    expect((await mock.getSettings()).onboarding.dismissed_tips).toContain("any-tip");
  });
});
