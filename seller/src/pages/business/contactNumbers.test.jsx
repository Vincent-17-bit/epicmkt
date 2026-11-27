import { describe, it, expect } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as mock from "../../api/mock.js";
import { M, signedInApp } from "../../test/utils.jsx";

// The call number and the WhatsApp number on the Account page: changed together, or one at a time to two different numbers.
const PW = "Demo-Passw0rd";

async function pickCountry(user, scope, search) {
  await user.click(within(scope).getByRole("button", { name: /country code/i }));
  const picker = screen.getByRole("dialog", { name: /choose a country/i });
  await user.type(within(picker).getByRole("combobox"), search);
  await user.click(within(picker).getAllByRole("option")[0]);
}

async function changePhone(user, { number = "0772 123 456", country = "uganda", tick, code = "123456" } = {}) {
  const card = (await screen.findByRole("heading", { name: "Phone number" })).closest("section");
  await user.click(within(card).getByRole("button", { name: "Change phone number" }));
  await user.type(within(card).getByLabelText("New phone number"), number);
  if (country) await pickCountry(user, card, country);
  const box = within(card).getByRole("checkbox", { name: /use this number for whatsapp too/i });
  if (tick !== undefined && box.checked !== tick) await user.click(box);
  await user.type(within(card).getByLabelText("Current password"), PW);
  await user.click(within(card).getByRole("button", { name: "Send code to this number" }));
  await user.type(await within(card).findByLabelText("Code from the text message"), code);
  await user.click(within(card).getByRole("button", { name: "Save phone number" }));
  return card;
}

describe("phone number and WhatsApp number", () => {
  it("shows both numbers, masked", async () => {
    await signedInApp("/business/account");
    expect(await screen.findByLabelText("Phone number, masked")).toHaveTextContent("+2547*****678");
    expect(await screen.findByLabelText("WhatsApp number, masked")).toHaveTextContent("+2547*****678");
    expect(screen.getByText(/the same as your call number/)).toBeInTheDocument();
  });

  it("WhatsApp follows a new call number when they are the same number today, and the box is ticked for them", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    const card = await changePhone(user);
    expect(await within(card).findByRole("status")).toHaveTextContent("Phone number and WhatsApp number saved.");
    expect(M.state.business.phone).toBe("+256772123456");
    expect(M.state.business.whatsapp).toBe("+256772123456");
    await waitFor(() => expect(screen.getByLabelText("WhatsApp number, masked")).toHaveTextContent("+2567*****456"));
  });

  it("a seller with a different WhatsApp number keeps it, unless they tick the box", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account", () => { M.state.business.whatsapp = "+254799000111"; });
    const card = (await screen.findByRole("heading", { name: "Phone number" })).closest("section");
    await user.click(within(card).getByRole("button", { name: "Change phone number" }));
    const box = within(card).getByRole("checkbox", { name: /use this number for whatsapp too/i });
    expect(box).not.toBeChecked(); // not ticked for them: they use two numbers
    expect(within(card).getByText(/your WhatsApp is now/)).toHaveTextContent("+2547*****111");
    await user.click(within(card).getByRole("button", { name: "Cancel" }));

    const done = await changePhone(user, { tick: false });
    expect(await within(done).findByRole("status")).toHaveTextContent(/^Phone number saved\./);
    expect(M.state.business.phone).toBe("+256772123456");
    expect(M.state.business.whatsapp).toBe("+254799000111"); // untouched
  });

  it("a seller with a different WhatsApp number can tick the box to move both", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account", () => { M.state.business.whatsapp = "+254799000111"; });
    const done = await changePhone(user, { tick: true });
    expect(await within(done).findByRole("status")).toHaveTextContent("Phone number and WhatsApp number saved.");
    expect(M.state.business.whatsapp).toBe("+256772123456");
  });

  it("changes WhatsApp on its own to a number from any country, without touching the call number", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    const card = (await screen.findByRole("heading", { name: "WhatsApp number" })).closest("section");
    await user.click(within(card).getByRole("button", { name: "Change WhatsApp number" }));
    await user.type(within(card).getByLabelText("New WhatsApp number"), "07911 123456");
    await pickCountry(user, card, "united kingdom");
    await user.click(within(card).getByRole("button", { name: "Save WhatsApp number" }));
    expect(await within(card).findByRole("status")).toHaveTextContent("WhatsApp number saved.");
    expect(M.state.business.whatsapp).toBe("+447911123456");
    expect(M.state.business.phone).toBe("+254712345678"); // the call number is not changed
    await waitFor(() => expect(within(card).getByLabelText("WhatsApp number, masked")).toHaveTextContent("+4479*****456"));
    expect(within(card).queryByText(/the same as your call number/)).toBeNull();
  });

  it("'Use my call number' puts WhatsApp back on the call number in one tap", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account", () => { M.state.business.whatsapp = "+254799000111"; });
    const card = (await screen.findByRole("heading", { name: "WhatsApp number" })).closest("section");
    await user.click(await within(card).findByRole("button", { name: "Use my call number" }));
    expect(await within(card).findByRole("status")).toHaveTextContent("WhatsApp now uses your call number.");
    expect(M.state.business.whatsapp).toBe(M.state.business.phone);
    await waitFor(() => expect(within(card).queryByRole("button", { name: "Use my call number" })).toBeNull());
  });

  it("refuses a WhatsApp number that cannot be real, and the one they already have", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/account");
    const card = (await screen.findByRole("heading", { name: "WhatsApp number" })).closest("section");
    await user.click(within(card).getByRole("button", { name: "Change WhatsApp number" }));
    await user.type(within(card).getByLabelText("New WhatsApp number"), "12345");
    await user.click(within(card).getByRole("button", { name: "Save WhatsApp number" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent(/valid WhatsApp number/);
    await user.clear(within(card).getByLabelText("New WhatsApp number"));
    await user.type(within(card).getByLabelText("New WhatsApp number"), "0712345678");
    await user.click(within(card).getByRole("button", { name: "Save WhatsApp number" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("That is already your WhatsApp number.");
  });
});
