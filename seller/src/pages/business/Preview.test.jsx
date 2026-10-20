import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import * as api from "../../api/index.js";
import { M, signedInApp, setTime } from "../../test/utils.jsx";

const open = (prepare) => signedInApp("/business/preview", prepare);

describe("shop preview", () => {
  it("shows the shop the way customers see it, with only the items customers can see", async () => {
    await open();
    const page = await screen.findByTestId("shop-preview");
    expect(within(page).getByRole("heading", { level: 1, name: "Demo Shop" })).toBeInTheDocument();
    expect(within(page).getByText("Quality you can trust")).toBeInTheDocument();
    for (const name of ["Fade cut", "Beard trim", "Hair dye", "Styling gel", "Wedding package"]) expect(within(page).getByText(name)).toBeInTheDocument();
    expect(within(page).queryByText("Old special")).toBeNull();
    expect(within(page).getByText("Opening hours")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Preview. This is how customers see your shop.");
    expect(screen.queryByTestId("preview-not-live")).toBeNull();
  });

  it("hides drafts and items an admin hid", async () => {
    await open(async () => {
      M.state.items.find((i) => i.id === "it-dye").draft = true;
      M.state.items.find((i) => i.id === "it-beard").hiddenByAdmin = true;
    });
    const page = await screen.findByTestId("shop-preview");
    expect(within(page).queryByText("Hair dye")).toBeNull();
    expect(within(page).queryByText("Beard trim")).toBeNull();
    expect(within(page).getByText("Fade cut")).toBeInTheDocument();
  });

  it("does nothing when a customer button is pressed", async () => {
    await open();
    const page = await screen.findByTestId("shop-preview");
    expect(within(page).getByRole("button", { name: /Report a problem/ })).toBeDisabled();
    expect(within(page).getByRole("button", { name: /Fade cut/ })).toBeDisabled();
    const calls = within(page).getAllByText("Call").map((el) => el.closest("a"));
    expect(calls.length).toBeGreaterThan(0);
    for (const link of calls) {
      expect(link).toHaveAttribute("aria-disabled", "true");
      expect(link).not.toHaveAttribute("href");
    }
  });

  it("shows running flash sales with their sale price", async () => {
    await open(async () => {
      setTime("2026-10-17T09:00:00.000Z");
      await api.createFlashSale({ itemId: "it-fade", discountType: "percent", discountValue: 20, endsAt: "2026-10-17T15:00:00Z", afterEnd: "keep" });
    });
    const section = await screen.findByRole("region", { name: "Flash sales at this store" });
    expect(within(section).getByText("Fade cut")).toBeInTheDocument();
    expect(within(section).getByText("-20%")).toBeInTheDocument();
    expect(within(section).getByText("KSh 400")).toBeInTheDocument();
  });

  it("shows no flash section when nothing is running", async () => {
    await open();
    await screen.findByTestId("shop-preview");
    expect(screen.queryByRole("region", { name: "Flash sales at this store" })).toBeNull();
  });

  it("warns when customers cannot see the shop and still shows the preview", async () => {
    await open(async () => M.setBusiness({ status: "paused" }));
    expect(await screen.findByTestId("preview-not-live")).toHaveTextContent("Your shop is paused.");
    expect(screen.getByTestId("shop-preview")).toBeInTheDocument();
  });

  it("links back to My listings", async () => {
    await open();
    await screen.findByTestId("shop-preview");
    expect(screen.getByRole("link", { name: "Back to My listings" })).toHaveAttribute("href", "/business/catalog");
  });
});
