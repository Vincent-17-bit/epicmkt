import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import CheckStatus from "./CheckStatus.jsx";
import PublicSellerLayout from "../PublicSellerLayout.jsx";
import { simSeed } from "../../../api/applications/mockStatus.js";

const css = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

const mount = () => {
  const router = createMemoryRouter(
    [{ path: "/become-a-seller", element: <PublicSellerLayout />, children: [{ path: "status", element: <CheckStatus /> }] }],
    { initialEntries: ["/become-a-seller/status"] }
  );
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
};

async function signIn(user, ref, phone = "0712345678") {
  await user.type(await screen.findByLabelText("Reference number"), ref);
  await user.type(screen.getByLabelText("Phone number"), phone);
  await user.click(screen.getByRole("button", { name: "Send me a code" }));
  await user.type(await screen.findByLabelText("6 digit code"), "123456");
  await user.click(screen.getByRole("button", { name: "Check my application" }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  simSeed();
});

afterEach(() => sessionStorage.clear());

describe("check my application", () => {
  it("validates the form and gives the same reply for wrong details", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Send me a code" }));
    expect(screen.getByText("Enter your reference number, for example EPM-2026-ABC234")).toBeInTheDocument();
    expect(screen.getByText(/valid Kenyan phone number/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Reference number"), "EPM-2026-NOPE99");
    await user.type(screen.getByLabelText("Phone number"), "0700000000");
    await user.click(screen.getByRole("button", { name: "Send me a code" }));
    expect(await screen.findByText(/If these details match an application, we have sent a code/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("6 digit code"), "123456");
    await user.click(screen.getByRole("button", { name: "Check my application" }));
    expect(await screen.findByText(/not correct or has expired/)).toBeInTheDocument();
  }, 20000);

  it("shows admin flags with icon and text, and only flagged items are editable", async () => {
    const user = userEvent.setup();
    mount();
    await signIn(user, "EPM-2026-DEMO03");
    expect(await screen.findByText("3 things need your attention")).toBeInTheDocument();
    const flagged = document.querySelectorAll('[data-flag="open"]');
    expect(flagged).toHaveLength(3);
    flagged.forEach((el) => {
      expect(el.querySelector('svg[data-icon="flag"]')).not.toBeNull();
      expect(within(el).getByText("Needs correction")).toBeInTheDocument();
    });
    expect(screen.getByText("Write your full names exactly as on your ID.")).toBeInTheDocument();
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.map((i) => i.id).sort()).toEqual(["edit-location-address", "edit-owner-fullName"]);
    expect(screen.queryByLabelText("Business name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resubmit for review" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Replace Single Business Permit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace Signboard or shop-front photo" })).not.toBeInTheDocument();
  }, 20000);

  it("enables resubmit only after every flag is addressed", async () => {
    const user = userEvent.setup();
    mount();
    await signIn(user, "EPM-2026-DEMO03");
    await screen.findByText("3 things need your attention");
    const name = screen.getByLabelText("Full names");
    await user.clear(name);
    await user.type(name, "Jane Wanjiku Otieno");
    await user.clear(screen.getByLabelText("Address or landmark"));
    await user.type(screen.getByLabelText("Address or landmark"), "Opposite Maseno market gate");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    expect(await screen.findByText("1 thing needs your attention")).toBeInTheDocument();
    expect(screen.getAllByText("Fixed, waiting for re-check")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Resubmit for review" })).toBeDisabled();
    const file = new File(["%PDF-1.4\n%%EOF"], "permit.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Choose new file for Single Business Permit"), file);
    expect(await screen.findByText(/New file ready: permit.pdf/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    await waitFor(() => expect(screen.getAllByText("Fixed, waiting for re-check")).toHaveLength(3));
    const resubmit = screen.getByRole("button", { name: "Resubmit for review" });
    await waitFor(() => expect(resubmit).toBeEnabled());
    await user.click(resubmit);
    expect(await screen.findByRole("heading", { name: "Submitted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save corrections" })).not.toBeInTheDocument();
  }, 40000);

  it("shows invalid corrections inline", async () => {
    const user = userEvent.setup();
    mount();
    await signIn(user, "EPM-2026-DEMO03");
    await screen.findByText("3 things need your attention");
    const name = screen.getByLabelText("Full names");
    await user.clear(name);
    await user.type(name, "J");
    await user.click(screen.getByRole("button", { name: "Save corrections" }));
    expect(await screen.findByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByLabelText("Full names")).toHaveAttribute("aria-invalid", "true");
  }, 20000);

  it("shows the payment card, then payment under confirmation", async () => {
    const user = userEvent.setup();
    mount();
    await signIn(user, "EPM-2026-DEMO05");
    expect(await screen.findByRole("heading", { name: "Approved, awaiting payment" })).toBeInTheDocument();
    expect(screen.getByText("123456")).toBeInTheDocument();
    expect(screen.getByText("KES 500")).toBeInTheDocument();
    await user.type(screen.getByLabelText("M-Pesa transaction code"), "short");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    expect(await screen.findByText(/10 character M-Pesa/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("M-Pesa transaction code"));
    await user.type(screen.getByLabelText("M-Pesa transaction code"), "QWE4RTY5UI");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    expect((await screen.findAllByRole("heading", { name: /Payment under confirmation/ })).length).toBe(2);
  }, 30000);

  it("shows the rejection reason and the activated message", async () => {
    const user = userEvent.setup();
    mount();
    await signIn(user, "EPM-2026-DEMO08");
    expect(await screen.findByText("The permit has been cancelled by the county.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a new application" })).toHaveAttribute("href", "/become-a-seller");
  }, 20000);

  it("shows the activated message", async () => {
    const user = userEvent.setup();
    mount();
    await signIn(user, "EPM-2026-DEMO07");
    expect(await screen.findByText(/login details have been sent to your phone by SMS or WhatsApp/)).toBeInTheDocument();
  }, 20000);
});

describe("styles", () => {
  it("uses the danger tokens for flags and defines them for light and dark", () => {
    const status = css("./status.module.css");
    expect(status).toMatch(/\[data-flag="open"\][^}]*border: 2px solid var\(--danger-border\)/);
    expect(status).toMatch(/\[data-flag="open"\][^}]*background: var\(--danger-bg\)/);
    expect(status).toMatch(/\[data-flag="open"\][^}]*color: var\(--danger-fg\)/);
    const layout = css("../layout.module.css");
    expect(layout).toMatch(/--danger-fg: #b91c1c;[\s\S]*--danger-bg: #fef2f2;[\s\S]*--danger-border: #fca5a5;/);
    expect(layout).toMatch(/prefers-color-scheme: dark\)[\s\S]*--danger-fg: #fca5a5;[\s\S]*--danger-bg: #3b0a0a;[\s\S]*--danger-border: #b91c1c;/);
  });

  it("keeps the header sticky and opaque and prevents sideways scroll", () => {
    const layout = css("../layout.module.css");
    expect(layout).toMatch(/\.header \{[^}]*position: sticky;[^}]*top: 0;[^}]*background: var\(--header-bg\)/);
    expect(layout).toMatch(/\.root \{[^}]*overflow-x: hidden/);
    expect(layout).toMatch(/\.root \{[^}]*height: 100dvh/);
  });
});
