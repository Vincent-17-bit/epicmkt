import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import * as api from "../../api/index.js";
import { M, signedInApp, setTime } from "../../test/utils.jsx";

const open = (prepare) => signedInApp("/business/preview", prepare);

describe("shop preview", () => {
  // Tue 20 Oct 2026, 09:30 in Nairobi, when the demo shop is open. Without a frozen clock this test only passed during
  // opening hours, because a "closed" banner is a second role="status" element.
  afterEach(() => vi.useRealTimers());

  it("shows the shop the way customers see it, with only the items customers can see", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-20T06:30:00Z") });
    await open();
    const page = await screen.findByTestId("shop-preview");
    expect(within(page).getByRole("heading", { level: 1, name: "Demo Shop" })).toBeInTheDocument();
    expect(within(page).getByText("Quality you can trust")).toBeInTheDocument();
    for (const name of ["Fade cut", "Beard trim", "Hair dye", "Wedding package"]) expect(within(page).getByText(name)).toBeInTheDocument();
    expect(within(page).queryByText("Old special")).toBeNull();
    // Out of stock items are not listed to customers, so the preview leaves them out too.
    expect(within(page).queryByText("Styling gel")).toBeNull();
    expect(within(page).getByText("Opening hours")).toBeInTheDocument();
    expect(screen.getByText(/^Preview\. This is how customers see your shop/)).toHaveTextContent("Preview. This is how customers see your shop.");
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
    expect(within(section).getByText("KES 400")).toBeInTheDocument();
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

  describe("opening-hours exceptions", () => {
    // Tue 20 Oct 2026, 09:30 in Nairobi. The demo shop is open Monday to Saturday, 08:00 to 18:00.
    const freezeTuesday = () => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-20T06:30:00Z") });
    afterEach(() => vi.useRealTimers());

    it("is open on a normal weekday", async () => {
      freezeTuesday();
      await open();
      const page = await screen.findByTestId("shop-preview");
      expect(within(page).getByText("Open now · Closes 6:00 PM")).toBeInTheDocument();
    });

    it("shows a closed day as closed, with the next opening, exactly as customers would see it", async () => {
      freezeTuesday();
      await open(() => api.saveException({ date: "2026-10-20", kind: "closed", note: "Public holiday" }));
      const page = await screen.findByTestId("shop-preview");
      expect(within(page).getByText("Closed · Opens Wed 8:00 AM")).toBeInTheDocument();
      expect(within(within(page).getByText("Tuesday").closest("tr")).getByText("Closed")).toBeInTheDocument();
    });

    it("shows special hours for the date instead of the weekly hours", async () => {
      freezeTuesday();
      await open(() => api.saveException({ date: "2026-10-20", kind: "special", intervals: [["10:00", "12:00"], ["15:00", "17:00"]] }));
      const page = await screen.findByTestId("shop-preview");
      expect(within(page).getByText("Closed · Opens 10:00 AM")).toBeInTheDocument();
      expect(within(within(page).getByText("Tuesday").closest("tr")).getByText("10:00 AM to 12:00 PM, 3:00 PM to 5:00 PM")).toBeInTheDocument();
    });

    it("shows the note next to the hours for that date, as plain text", async () => {
      freezeTuesday();
      const note = "<b>Back</b> Wednesday & thanks";
      await open(() => api.saveException({ date: "2026-10-20", kind: "closed", note }));
      const page = await screen.findByTestId("shop-preview");
      const row = within(page).getByText("Tuesday").closest("tr");
      expect(within(row).getByText("20 Oct")).toBeInTheDocument();
      expect(within(row).getByText(note)).toBeInTheDocument();
      expect(row.querySelector("b")).toBeNull();
      expect(within(within(page).getByText("Wednesday").closest("tr")).queryByText(note)).toBeNull();
    });

    it("opens the shop on a Sunday the weekly hours say is closed", async () => {
      freezeTuesday();
      await open(() => api.saveException({ date: "2026-10-25", kind: "special", intervals: [["10:00", "14:00"]] }));
      const page = await screen.findByTestId("shop-preview");
      expect(within(within(page).getByText("Sunday").closest("tr")).getByText("10:00 AM to 2:00 PM")).toBeInTheDocument();
    });
  });
});
