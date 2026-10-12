import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { iso, renderPage } from "../../test/render.jsx";
import OffersPage from "./OffersPage.jsx";

const offer = (n, extra = {}) => ({
  id: `o${n}`, business_id: "b-demo", title: `Offer ${n}`, description: "", discount_type: "percent", discount_value: 10,
  starts_at: iso(-10), ends_at: iso(600), banner_path: null, active: true, item_ids: [], admin_status: null, admin_reason: null,
  removed_by_admin: false, hidden_by_admin: false, created_at: iso(-n), ...extra,
});

describe("offers and flash sales", () => {
  it("shows usage meters and the empty states", async () => {
    renderPage(<OffersPage />);
    expect(await screen.findByText("No offers yet")).toBeInTheDocument();
    expect(screen.getByText("No flash sales yet")).toBeInTheDocument();
    const meters = screen.getAllByRole("meter");
    expect(meters.map((m) => m.getAttribute("aria-valuemax"))).toEqual(["8", "3", "1"]);
  });

  it("premium shows unlimited offers and its flash limits", async () => {
    renderPage(<OffersPage />, { plan_key: "premium" }, (s) => { s.offers = Array.from({ length: 9 }, (_, n) => offer(n)); });
    expect(await screen.findByText("9 · Unlimited")).toBeInTheDocument();
    expect(screen.getAllByRole("meter").map((m) => m.getAttribute("aria-valuemax"))).toEqual(["10", "5"]);
    expect(screen.getByRole("button", { name: "New offer" })).toBeEnabled();
  });

  it("standard at 8 active offers cannot add more and sees the upgrade prompt", async () => {
    renderPage(<OffersPage />, {}, (s) => { s.offers = Array.from({ length: 8 }, (_, n) => offer(n)); });
    expect(await screen.findByText(/used all 8 active offers/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New offer" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "See Premium" })).toBeInTheDocument();
  });

  it("computes status from dates and counts down", async () => {
    renderPage(<OffersPage />, { plan_key: "premium" }, (s) => {
      s.offers = [
        offer(1, { title: "Running", starts_at: iso(-60), ends_at: iso(125) }),
        offer(2, { title: "Later", starts_at: iso(60), ends_at: iso(240) }),
        offer(3, { title: "Gone", starts_at: iso(-300), ends_at: iso(-60) }),
      ];
    });
    const running = (await screen.findByText("Running")).closest("li");
    expect(within(running).getByText("Active")).toBeInTheDocument();
    expect(within(running).getByText(/Ends in 2h/)).toBeInTheDocument();
    expect(within(screen.getByText("Later").closest("li")).getByText("Scheduled")).toBeInTheDocument();
    expect(within(screen.getByText("Gone").closest("li")).getByText("Expired")).toBeInTheDocument();
  });

  it("shows Removed by admin with the reason and hides edit", async () => {
    renderPage(<OffersPage />, {}, (s) => {
      s.offers = [offer(1, { title: "Miracle cure", removed_by_admin: true, admin_status: "removed", admin_reason: "Misleading claim" })];
      s.flash = [{ id: "f1", business_id: "b-demo", item_id: "i1", discount_type: "percent", discount_value: 20, starts_at: iso(-30), ends_at: iso(60), on_end: "keep", removed_by_admin: true, admin_status: "removed", admin_reason: "Fake price", hidden_by_admin: false, created_at: iso(-30) }];
    });
    const card = (await screen.findByText("Miracle cure")).closest("li");
    expect(within(card).getByText("Removed by admin")).toBeInTheDocument();
    expect(within(card).getByText(/Misleading claim/)).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(card).queryByText("Active")).toBeNull();
    expect(screen.getAllByText("Removed by admin")).toHaveLength(2);
    expect(screen.getByText(/Fake price/)).toBeInTheDocument();
  });

  it("is read-only when the listing is paused or suspended", async () => {
    for (const status of ["paused", "suspended"]) {
      const { unmount } = renderPage(<OffersPage />, { status }, (s) => { s.offers = [offer(1)]; });
      expect(await screen.findByText("Offer 1")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "New offer" })).toBeNull();
      expect(screen.queryByRole("button", { name: "New flash sale" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
      unmount();
    }
  });

  it("validates the offer form before saving", async () => {
    const user = userEvent.setup();
    renderPage(<OffersPage />);
    await user.click(await screen.findByRole("button", { name: "New offer" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Save offer" }));
    expect(await within(dialog).findByText("Title needs 3 to 120 characters")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Title"), "Weekend deal");
    await user.type(within(dialog).getByLabelText("Percent (1 to 90)"), "95");
    await user.click(within(dialog).getByRole("button", { name: "Save offer" }));
    expect(await within(dialog).findByText("Percent must be a whole number from 1 to 90")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Starts/)).toBeNull();
    const kes = within(dialog).getByLabelText("KES off", { selector: "input[type=radio]" });
    await user.click(kes);
    await user.clear(within(dialog).getByLabelText("KES off", { selector: "input[inputmode]" }));
    await user.type(within(dialog).getByLabelText("KES off", { selector: "input[inputmode]" }), "5000");
    await user.click(within(dialog).getByLabelText(/Haircut/));
    await user.click(within(dialog).getByRole("button", { name: "Save offer" }));
    expect(await within(dialog).findByText("KES off must be less than the item price")).toBeInTheDocument();
  });

  it("creates an offer and a flash sale, then blocks a second flash sale on standard", async () => {
    const user = userEvent.setup();
    renderPage(<OffersPage />);
    await user.click(await screen.findByRole("button", { name: "New offer" }));
    let dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Title"), "Weekend deal");
    await user.type(within(dialog).getByLabelText("Percent (1 to 90)"), "20");
    await user.click(within(dialog).getByRole("button", { name: "Save offer" }));
    expect(await screen.findByText("Weekend deal")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("1 of 8")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "New flash sale" }));
    dialog = await screen.findByRole("dialog", { name: "New flash sale" });
    await user.selectOptions(within(dialog).getByLabelText("Item"), "i1");
    await user.type(within(dialog).getByLabelText("Percent (1 to 90)"), "25");
    await user.click(within(dialog).getByLabelText("Unlist the item"));
    await user.click(within(dialog).getByRole("button", { name: "Start flash sale" }));
    const card = (await screen.findByText("Haircut")).closest("li");
    expect(within(card).getByText("Running")).toBeInTheDocument();
    expect(within(card).getByText(/will be unlisted when it ends/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "New flash sale" })).toBeDisabled());
    expect(screen.getByText(/1 flash sale at a time/)).toBeInTheDocument();
  });
});
