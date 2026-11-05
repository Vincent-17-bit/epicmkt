import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signedInApp } from "../test/utils.jsx";
import * as mock from "../api/mock.js";
import { useSettings } from "../state/settings.js";
import { useToasts } from "../state/toast.js";

beforeEach(() => {
  useSettings.getState().reset();
  useToasts.getState().clear();
});

const open = async () => {
  await signedInApp("/business/settings");
  await screen.findByRole("heading", { level: 1, name: "Settings" });
  return screen.findByRole("region", { name: "Opening hours" });
};

describe("opening hours editor", () => {
  it("sits in Settings with the shop clock and a customer preview", async () => {
    const section = await open();
    expect(within(section).getByTestId("shop-clock")).toHaveTextContent(/at your shop/);
    expect(within(section).getByRole("combobox", { name: "Customer's time zone" })).toBeInTheDocument();
    expect(within(section).getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Opening hours" })).toHaveAttribute("href", "#hours");
  });

  it("saves, reloads the same values, and undoes", async () => {
    const user = userEvent.setup();
    const section = await open();
    const save = within(section).getByRole("button", { name: "Save opening hours" });
    expect(save).toBeDisabled();
    await user.click(within(section).getByRole("switch", { name: "Open on Sunday" }));
    await user.click(within(section).getByRole("button", { name: "Open 24 hours every day" }));
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await within(section).findByText("Opening hours saved.")).toBeInTheDocument();
    const saved = (await mock.getShopPreview()).shop.hours;
    expect(Object.keys(saved)).toHaveLength(7);
    expect(saved.sun).toEqual(["00:00", "23:59"]);
    await user.click(within(section).getByRole("button", { name: "Undo" }));
    expect(await within(section).findByText("Previous opening hours restored.")).toBeInTheDocument();
    expect((await mock.getShopPreview()).shop.hours.sun).toBeUndefined();
  });

  it("marks an overnight shift and explains a zero-length day in plain words", async () => {
    const user = userEvent.setup();
    const section = await open();
    const closes = within(section).getByLabelText("Monday closes");
    await user.clear(closes);
    await user.type(closes, "02:00");
    expect(within(section).getAllByText("closes next day").length).toBeGreaterThan(0);
    const opens = within(section).getByLabelText("Monday opens");
    await user.clear(opens);
    await user.type(opens, "02:00");
    await user.click(within(section).getByRole("button", { name: "Save opening hours" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent(/Monday: .*cannot be the same/);
  });

  it("discards unsaved changes", async () => {
    const user = userEvent.setup();
    const section = await open();
    await user.click(within(section).getByRole("switch", { name: "Open on Monday" }));
    await user.click(within(section).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(within(section).getByRole("button", { name: "Save opening hours" })).toBeDisabled());
    expect(within(section).getByRole("switch", { name: "Open on Monday" })).toHaveAttribute("aria-checked", "true");
  });
});
