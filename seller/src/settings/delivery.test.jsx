import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import { signedInApp } from "../test/utils.jsx";
import * as mock from "../api/mock.js";
import { useSettings } from "../state/settings.js";
import { useToasts } from "../state/toast.js";
import { previewLine } from "./ShopDelivery.jsx";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
beforeEach(() => { useSettings.getState().reset(); useToasts.getState().clear(); });

const open = async () => {
  const view = await signedInApp("/business/settings#delivery");
  await screen.findByRole("heading", { level: 1, name: "Settings" });
  await screen.findByRole("heading", { level: 2, name: "Delivery" });
  return view;
};

describe("delivery settings", () => {
  it("starts as no delivery with a pickup preview and nothing to save", async () => {
    await open();
    expect(screen.getByRole("switch", { name: "I deliver" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("delivery-preview")).toHaveTextContent(/^No delivery\./);
    expect(screen.getByRole("button", { name: "Save delivery" })).toBeDisabled();
    expect(screen.queryByLabelText("Delivery fee (KES)")).toBeNull();
  });

  it("turns delivery on, saves fee, radius and area, and shows what buyers will read", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("switch", { name: "I deliver" }));
    await user.type(screen.getByLabelText("Delivery fee (KES)"), "150");
    await user.type(screen.getByLabelText("How far you deliver (km)"), "5");
    await user.type(screen.getByLabelText("Where you deliver"), "Westlands");
    expect(screen.getByTestId("delivery-preview")).toHaveTextContent("Delivery from KES 150 to Westlands within 5 km.");
    await user.click(screen.getByRole("button", { name: "Save delivery" }));
    await waitFor(() => expect(useToasts.getState().toasts.some((t) => t.message === "Delivery saved")).toBe(true));
    const facts = await mock.getBusinessFacts();
    expect([facts.delivers, facts.delivery_fee, facts.delivery_radius_km, facts.delivery_area]).toEqual([true, 150, 5, "Westlands"]);
  });

  it("names each field that is not valid and saves nothing", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("switch", { name: "I deliver" }));
    await user.type(screen.getByLabelText("Delivery fee (KES)"), "-5");
    await user.type(screen.getByLabelText("How far you deliver (km)"), "0");
    await user.click(screen.getByRole("button", { name: "Save delivery" }));
    expect(await screen.findByText("Enter the fee as a number of shillings, zero or more.")).toBeInTheDocument();
    expect(screen.getByText("Enter the distance in kilometres, more than zero.")).toBeInTheDocument();
    expect(screen.getByLabelText("Delivery fee (KES)")).toHaveAttribute("aria-invalid", "true");
    expect((await mock.getBusinessFacts()).delivers).toBeNull();
  });

  it("undo goes back to what is saved", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("switch", { name: "I deliver" }));
    await user.click(screen.getByRole("button", { name: "Undo changes" }));
    expect(screen.getByRole("switch", { name: "I deliver" })).toHaveAttribute("aria-checked", "false");
  });

  it("has no accessibility violations", async () => {
    const { container } = await open();
    const section = within(container).getByRole("heading", { level: 2, name: "Delivery" }).closest("section");
    const results = await axe(section);
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
});

describe("preview line", () => {
  it("covers free, unknown fee, minimum order and no delivery", () => {
    const base = { offers: true, fee: "", radiusKm: "", area: "", minOrder: "", notes: "" };
    expect(previewLine({ ...base, fee: "0" }, "")).toBe("Free delivery.");
    expect(previewLine(base, "")).toBe("Delivers.");
    expect(previewLine({ ...base, fee: "100", minOrder: "500" }, "")).toBe("Delivery from KES 100 minimum order KES 500.");
    expect(previewLine({ ...base, offers: false }, "Maseno, Kisumu")).toBe("No delivery. Pick up from the shop, Maseno, Kisumu.");
  });
});
