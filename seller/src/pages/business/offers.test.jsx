import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import { signedInApp, setTime } from "../../test/utils.jsx";
import { setServerOffset } from "../../lib/clock.js";
import { setUserTimeZone } from "@epicmkt/shared";

const NOW = "2026-10-17T09:00:00.000Z";
const open = (prepare) => signedInApp("/business/offers", async () => { setTime(NOW); setServerOffset(0); await prepare?.(); });
const rows = () => screen.queryAllByTestId("offer-row");

afterEach(() => vi.useRealTimers());

describe("seller offers", () => {
  it("shows an empty state and the plan quota", async () => {
    await open();
    expect(await screen.findByTestId("empty")).toBeInTheDocument();
    expect(screen.getByTestId("offer-quota")).toHaveTextContent("Active now: 0 of 8");
  });

  it("builds a buy 2 get 1 free offer from a recipe on one product only", async () => {
    const user = userEvent.setup();
    await open();
    const button = await screen.findByRole("button", { name: "New product offer" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await user.click(screen.getByRole("button", { name: /Buy 2, get 1 free/ }));
    await user.click(await screen.findByRole("checkbox", { name: /Fade cut/ }));
    expect(screen.getByTestId("offer-preview")).toHaveTextContent(/Buy 2 Get 1 Free/i);
    await user.click(screen.getByRole("button", { name: "Start offer" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Live");
    expect(rows()[0]).toHaveTextContent("Fade cut");
    const saved = await api.listOffers();
    expect(saved[0].items).toEqual([{ itemId: "it-fade", role: "main" }]);
  });

  it("refuses an offer with no product and pauses and ends a running one", async () => {
    const user = userEvent.setup();
    await open(() => api.saveOffer(null, { kind: "percent_off", config: { percent: 10 }, items: [{ itemId: "it-fade", role: "main" }] }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Paused"));
    await user.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Live"));
    await user.click(screen.getByRole("button", { name: "End now" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "End now" })).toBeNull());
  });

  it("rejects an offer without products", async () => {
    await open();
    await expect(api.saveOffer(null, { kind: "percent_off", config: { percent: 10 }, items: [] })).rejects.toMatchObject({ code: "no_items" });
    fireEvent.click(await screen.findByRole("button", { name: "New product offer" }));
  });

  it("builds a shop offer with no products and keeps it apart from product offers", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(await screen.findByRole("button", { name: "New shop offer" }));
    expect(screen.getByRole("group", { name: "Offer ideas" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search your products")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Welcome offer/ }));
    expect(screen.getByTestId("offer-preview")).toHaveTextContent("10% off");
    await user.click(screen.getByRole("button", { name: "Start offer" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Whole shop");
    const saved = await api.listOffers();
    expect(saved[0]).toMatchObject({ scope: "store", kind: "percent_off", items: [] });
  });

  it("edits a shop offer", async () => {
    const user = userEvent.setup();
    await open(() => api.saveOffer(null, { scope: "store", kind: "percent_off", config: { percent: 10 } }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const percent = await screen.findByRole("spinbutton", { name: /Percent off/ });
    await user.clear(percent);
    await user.type(percent, "25");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("25% off"));
    expect((await api.listOffers())[0].config).toEqual({ percent: 25 });
  });

  it("deletes a running offer and an ended one after a confirmation", async () => {
    const user = userEvent.setup();
    await open(async () => {
      await api.saveOffer(null, { kind: "percent_off", config: { percent: 10 }, items: [{ itemId: "it-fade", role: "main" }] });
      const ended = await api.saveOffer(null, { scope: "store", kind: "percent_off", config: { percent: 5 } });
      await api.endOffer(ended.id);
    });
    await waitFor(() => expect(rows()).toHaveLength(2));
    for (let left = 2; left > 0; left -= 1) {
      await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
      await user.click(await screen.findByRole("button", { name: "Delete for good" }));
      await waitFor(() => expect(rows()).toHaveLength(left - 1));
    }
    expect(await api.listOffers()).toEqual([]);
  });

  it("keeps an offer when the delete is cancelled", async () => {
    const user = userEvent.setup();
    await open(() => api.saveOffer(null, { scope: "store", kind: "percent_off", config: { percent: 10 } }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(rows()).toHaveLength(1);
    expect(await api.listOffers()).toHaveLength(1);
  });

  describe("times follow the seller's own time zone", () => {
    // Same rule as the flash sale form: the seller types a wall clock time, and the UTC instant it means for them is stored.
    const schedule = async (zone, start, end) => {
      const user = userEvent.setup();
      await open(() => setUserTimeZone(zone));
      setUserTimeZone(zone);
      await user.click(await screen.findByRole("button", { name: "New shop offer" }));
      await user.click(screen.getByRole("button", { name: /Welcome offer/ }));
      fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: start } });
      fireEvent.change(screen.getByLabelText(/^Ends/), { target: { value: end } });
      await user.click(screen.getByRole("button", { name: "Start offer" }));
      await waitFor(() => expect(rows()).toHaveLength(1));
      return (await api.listOffers())[0];
    };

    it("stores 18:00 to 20:00 in New York (EDT, UTC-4) as the right UTC instants", async () => {
      const offer = await schedule("America/New_York", "2026-10-20T18:00", "2026-10-20T20:00");
      expect(offer.startsAt).toBe("2026-10-20T22:00:00.000Z");
      expect(offer.endsAt).toBe("2026-10-21T00:00:00.000Z");
    });

    it("stores the same wall clock in Nairobi (UTC+3) as a different instant", async () => {
      const offer = await schedule("Africa/Nairobi", "2026-10-20T18:00", "2026-10-20T20:00");
      expect(offer.startsAt).toBe("2026-10-20T15:00:00.000Z");
      expect(offer.endsAt).toBe("2026-10-20T17:00:00.000Z");
    });

    it("labels the start field with the seller's zone, not Nairobi's", async () => {
      const user = userEvent.setup();
      await open(() => setUserTimeZone("America/New_York"));
      setUserTimeZone("America/New_York");
      await user.click(await screen.findByRole("button", { name: "New shop offer" }));
      expect(screen.getByText(/Starts \(your time, GMT-4, blank is now\)/)).toBeInTheDocument();
      expect(screen.queryByText(/Nairobi time/)).toBeNull();
    });
  });
});
