import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import { M, signedInApp, setTime } from "../../test/utils.jsx";
import { setServerOffset } from "../../lib/clock.js";
import { setUserTimeZone } from "@epicmkt/shared";

const NOW = "2026-10-17T09:00:00.000Z";
const open = (prepare) => signedInApp("/business/flash", async () => { setTime(NOW); setServerOffset(0); await prepare?.(); });
const sale = (itemId, extra = {}) => api.createFlashSale({ itemId, discountType: "percent", discountValue: 20, endsAt: "2026-10-17T15:00:00Z", afterEnd: "keep", ...extra });
const rows = () => screen.queryAllByTestId("flash-sale");
const choose = (name) => fireEvent.change(screen.getByLabelText("Item"), { target: { value: name } });
const fill = (value) => fireEvent.change(screen.getByLabelText(/^(Percent \(1 to 99\)|Amount off \(KES\)|Sale price \(KES\))$/), { target: { value } });
const newSale = async (user) => {
  const button = await screen.findByRole("button", { name: "New flash sale" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
};

afterEach(() => vi.useRealTimers());

describe("seller flash sales", () => {
  it("shows an empty state and the plan quota", async () => {
    await open();
    expect(await screen.findByTestId("empty")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("flash-quota")).toHaveTextContent("Running now: 0 of 1"));
    expect(screen.getByTestId("flash-quota")).toHaveTextContent("This month: 0 of 3");
  });

  it("creates a sale with a quick duration and it appears with a live countdown", async () => {
    const user = userEvent.setup();
    await open();
    await newSale(user);
    choose("it-fade");
    fill("20");
    expect(screen.getByTestId("fs-preview")).toHaveTextContent("Customers pay KES 400 instead of KES 500");
    await user.click(screen.getByRole("button", { name: "6 hours" }));
    await user.type(screen.getByLabelText(/Headline/), "Weekend fade deal");
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Fade cut");
    expect(rows()[0]).toHaveTextContent("Live");
    expect(rows()[0]).toHaveTextContent("20% off (KES 400), Weekend fade deal");
    expect(screen.getByTestId("flash-timer")).toHaveTextContent("06:00:0");
    await waitFor(() => expect(screen.getByTestId("flash-quota")).toHaveTextContent("Running now: 1 of 1"));
    expect(M.state.flash[0].status).toBe("live");
  });

  it("lists only items that can go on sale", async () => {
    const user = userEvent.setup();
    await open();
    await newSale(user);
    const names = within(screen.getByLabelText("Item")).getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual(["Choose an item", "Fade cut (KES 500)", "Beard trim (KES 300)", "Hair dye (KES 1,200)"]);
  });

  it("blocks bad input with clear messages and sends nothing", async () => {
    const user = userEvent.setup();
    await open();
    await newSale(user);
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose one of your items");
    choose("it-fade");
    fill("100");
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid discount");
    fill("20");
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an end time");
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "2026-11-05T12:00" } });
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    expect(screen.getByRole("alert")).toHaveTextContent("14 days at most");
    expect(M.state.flash).toHaveLength(0);
  });

  it("schedules a sale for later and it shows as scheduled, not live", async () => {
    const user = userEvent.setup();
    await open();
    await newSale(user);
    choose("it-beard");
    fill("50");
    await user.click(screen.getByLabelText("Schedule"));
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: "2026-10-18T10:00" } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "2026-10-18T14:00" } });
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Scheduled");
    expect(rows()[0]).not.toHaveTextContent("Ends in");
    expect(M.state.flash[0].status).toBe("scheduled");
  });

  it("stops a second sale over the plan limit with the plan message", async () => {
    await open(() => sale("it-fade"));
    expect(await screen.findByText(/Your plan limit is reached/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New flash sale" })).toBeDisabled();
    await expect(sale("it-beard")).rejects.toMatchObject({ code: "limit_reached", message: "limit_reached:flash_concurrent" });
  });

  it("ends a sale early after a confirmation, and it moves to history", async () => {
    const user = userEvent.setup();
    await open(() => sale("it-fade", { discountType: "amount_off", discountValue: 100 }));
    await user.click(await screen.findByRole("button", { name: "End Fade cut flash sale early" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Customers will see the normal price straight away");
    await user.click(screen.getByRole("button", { name: "Keep it running" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "End Fade cut flash sale early" }));
    await user.click(screen.getByRole("button", { name: "End sale" }));
    expect(await screen.findByTestId("empty")).toBeInTheDocument();
    expect(M.state.flash[0]).toMatchObject({ status: "ended", endedReason: "seller" });
    expect(screen.getByText(/Ended by you/)).toBeInTheDocument();
  });

  it("edits the headline and note while running, but not the price", async () => {
    const user = userEvent.setup();
    await open(() => sale("it-fade", { discountValue: 10 }));
    await user.click(await screen.findByRole("button", { name: "Edit Fade cut headline and note" }));
    await user.type(screen.getByLabelText("Headline"), "Last hours");
    await user.type(screen.getByLabelText("Quantity note"), "While stock lasts");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("10% off (KES 450), Last hours"));
    expect(rows()[0]).toHaveTextContent("While stock lasts");
    expect(screen.queryByLabelText(/^Percent/)).toBeNull();
  });

  it("a sale that ends by time leaves the running list, hides the item when asked and notifies the seller", async () => {
    await open(() => sale("it-fade", { endsAt: "2026-10-17T10:00:00Z", afterEnd: "unlist" }));
    expect(await screen.findByTestId("flash-timer")).toBeInTheDocument();
    await act(async () => {
      setTime("2026-10-17T10:00:01.000Z");
      setServerOffset(0);
    });
    await waitFor(() => expect(screen.getByTestId("empty")).toBeInTheDocument(), { timeout: 4000 });
    expect(await screen.findByText(/Ended on time/)).toBeInTheDocument();
    expect(M.state.items.find((i) => i.id === "it-fade").visible).toBe(false);
    expect(M.state.messages.some((m) => m.subject === "Flash sale ended")).toBe(true);
  });

  it("a sale created elsewhere appears without a reload", async () => {
    await open();
    expect(await screen.findByTestId("empty")).toBeInTheDocument();
    await act(async () => {
      await sale("it-dye", { discountType: "sale_price", discountValue: 900 });
    });
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Hair dye");
  });

  it("extends a running sale from the Extend control and the countdown grows", async () => {
    const user = userEvent.setup();
    await open(() => sale("it-fade"));
    await user.click(await screen.findByRole("button", { name: "Extend Fade cut flash sale" }));
    expect(screen.getByRole("group", { name: "Extend Fade cut flash sale" })).toHaveTextContent("14 days from its start");
    await user.click(screen.getByRole("button", { name: "Add 1 hour" }));
    await waitFor(() => expect(M.state.flash[0].endsAt).toBe("2026-10-17T16:00:00.000Z"));
    await waitFor(() => expect(screen.getByTestId("flash-timer")).toHaveTextContent("07:00:0"));
    expect(screen.queryByRole("group", { name: "Extend Fade cut flash sale" })).toBeNull();
  });

  it("offers 7 days and a run-to-the-limit button, and the limit is 14 days from the start", async () => {
    const user = userEvent.setup();
    await open(() => sale("it-fade"));
    await user.click(await screen.findByRole("button", { name: "Extend Fade cut flash sale" }));
    await user.click(screen.getByRole("button", { name: "Run to the 14 day limit" }));
    await waitFor(() => expect(M.state.flash[0].endsAt).toBe("2026-10-31T09:00:00.000Z"));
    await user.click(await screen.findByRole("button", { name: "Extend Fade cut flash sale" }));
    expect(screen.getByRole("group", { name: "Extend Fade cut flash sale" })).toHaveTextContent("reached the 14 day limit");
    expect(screen.queryByRole("button", { name: /^Add / })).toBeNull();
  });

  it("extends to an exact end the seller picks, inside the limit only", async () => {
    const user = userEvent.setup();
    setUserTimeZone("UTC");
    await open(() => sale("it-fade"));
    await user.click(await screen.findByRole("button", { name: "Extend Fade cut flash sale" }));
    const picker = screen.getByLabelText(/Or pick the exact end/);
    fireEvent.change(picker, { target: { value: "2026-10-30T12:00" } });
    await user.click(screen.getByRole("button", { name: "Set end time" }));
    await waitFor(() => expect(M.state.flash[0].endsAt).toBe("2026-10-30T12:00:00.000Z"));
  });

  it("the mock only pushes an open sale later, within 14 days of its start", async () => {
    await open(() => sale("it-fade"));
    const id = M.state.flash[0].id;
    await expect(api.extendFlashSale(id, "2026-10-17T15:00:00Z")).rejects.toMatchObject({ code: "invalid_window" });
    await expect(api.extendFlashSale(id, "2026-10-17T10:00:00Z")).rejects.toMatchObject({ code: "invalid_window" });
    await expect(api.extendFlashSale(id, "not a date")).rejects.toMatchObject({ code: "invalid_window" });
    await expect(api.extendFlashSale(id, "2026-10-31T09:01:00Z")).rejects.toMatchObject({ code: "duration_too_long" });
    await expect(api.extendFlashSale("nope", "2026-10-17T16:00:00Z")).rejects.toMatchObject({ code: "not_found" });
    await expect(api.extendFlashSale(id, "2026-10-31T09:00:00Z")).resolves.toBe(true);
    await api.endFlashSale(id);
    await expect(api.extendFlashSale(id, "2026-10-17T16:00:00Z")).rejects.toMatchObject({ code: "flash_closed" });
  });

  it("creates a sale that runs for two weeks, and refuses one minute more", async () => {
    await open();
    await expect(sale("it-fade", { endsAt: "2026-10-31T09:01:00Z" })).rejects.toMatchObject({ code: "duration_too_long" });
    await expect(sale("it-fade", { endsAt: "2026-10-31T09:00:00Z" })).resolves.toMatchObject({ status: "live" });
  });

  describe("renewing an ended sale", () => {
    const endIt = async () => { await api.endFlashSale(M.state.flash.at(-1).id); };

    it("offers Renew on an ended sale, runs it again with the same terms for the chosen time, and it goes live", async () => {
      const user = userEvent.setup();
      await open(async () => { await sale("it-fade", { headline: "Weekend fade deal", quantityNote: "While stock lasts" }); await endIt(); });
      await user.click(await screen.findByRole("button", { name: "Renew Fade cut flash sale" }));
      const panel = await screen.findByTestId("renew-panel");
      expect(panel).toHaveTextContent("20% off");
      await user.click(within(panel).getByRole("button", { name: "14 days" }));
      expect(within(panel).getByTestId("renew-summary")).toHaveTextContent("14 days in all");
      await user.click(within(panel).getByRole("button", { name: "Renew sale" }));
      await waitFor(() => expect(M.state.flash).toHaveLength(2));
      const renewed = M.state.flash[1];
      expect(renewed).toMatchObject({ itemId: "it-fade", discountType: "percent", discountValue: 20, headline: "Weekend fade deal", quantityNote: "While stock lasts", status: "live" });
      expect(renewed.endsAt).toBe("2026-10-31T09:00:00.000Z");
      await waitFor(() => expect(screen.getByRole("heading", { name: /Running and scheduled/ })).toBeInTheDocument());
      await waitFor(() => expect(rows().some((r) => r.dataset.phase === "live")).toBe(true));
      expect(screen.queryByRole("button", { name: "Renew Fade cut flash sale" })).toBeNull();
    });

    it("lets the seller pick any end up to 14 days and explains one that is too far", async () => {
      const user = userEvent.setup();
      setUserTimeZone("UTC");
      await open(async () => { await sale("it-fade"); await endIt(); });
      await user.click(await screen.findByRole("button", { name: "Renew Fade cut flash sale" }));
      const panel = await screen.findByTestId("renew-panel");
      fireEvent.change(within(panel).getByLabelText(/Or pick the exact end/), { target: { value: "2026-10-30T18:00" } });
      expect(within(panel).getByTestId("renew-summary")).toHaveTextContent("13 days 9 hours in all");
      fireEvent.change(within(panel).getByLabelText(/Or pick the exact end/), { target: { value: "2026-11-20T18:00" } });
      expect(within(panel).getByTestId("renew-summary")).toHaveTextContent("A flash sale can run for 14 days at most.");
      await user.click(within(panel).getByRole("button", { name: "Renew sale" }));
      expect(await within(panel).findByRole("alert")).toHaveTextContent("14 days at most");
      expect(M.state.flash).toHaveLength(1);
    });

    it("does not offer Renew while the item has a sale running, or after EpicMKT stopped the sale", async () => {
      await open(async () => { await sale("it-fade"); await endIt(); await sale("it-fade"); });
      await screen.findAllByTestId("flash-sale");
      expect(screen.queryByRole("button", { name: /^Renew / })).toBeNull();
    });

    it("only the newest ended sale of an item shows Renew", async () => {
      await open(async () => { await sale("it-fade"); await endIt(); await sale("it-fade"); await endIt(); });
      await waitFor(() => expect(rows()).toHaveLength(2));
      expect(screen.getAllByRole("button", { name: "Renew Fade cut flash sale" })).toHaveLength(1);
    });

    it("renews by schedule and shows it as scheduled", async () => {
      const user = userEvent.setup();
      setUserTimeZone("UTC");
      await open(async () => { await sale("it-fade"); await endIt(); });
      await user.click(await screen.findByRole("button", { name: "Renew Fade cut flash sale" }));
      const panel = await screen.findByTestId("renew-panel");
      await user.click(within(panel).getByRole("radio", { name: "Schedule" }));
      fireEvent.change(within(panel).getByLabelText(/^Starts/), { target: { value: "2026-10-20T08:00" } });
      fireEvent.change(within(panel).getByLabelText(/Or pick the exact end/), { target: { value: "2026-11-03T08:00" } });
      await user.click(within(panel).getByRole("button", { name: "Schedule renewal" }));
      await waitFor(() => expect(M.state.flash).toHaveLength(2));
      expect(M.state.flash[1]).toMatchObject({ status: "scheduled", startsAt: "2026-10-20T08:00:00.000Z", endsAt: "2026-11-03T08:00:00.000Z" });
    });
  });

  it("the mock enforces one live sale per item and blocks hidden or out of stock items", async () => {
    await open(async () => {
      M.setBusiness({ planKey: "premium" });
      await sale("it-fade");
    });
    await expect(sale("it-fade")).rejects.toMatchObject({ code: "item_has_sale" });
    await expect(sale("it-gel")).rejects.toMatchObject({ code: "item_unavailable" });
    await expect(sale("it-old")).rejects.toMatchObject({ code: "item_unavailable" });
    await expect(sale("it-quote")).rejects.toMatchObject({ code: "item_not_discountable" });
    await expect(sale("nope")).rejects.toMatchObject({ code: "item_not_found" });
  });
});

describe("flash sale times follow the seller's own time zone", () => {
  // The seller types a wall clock time; what is stored and sent is the UTC instant that wall clock means for them.
  const schedule = async (zone, start, end) => {
    const user = userEvent.setup();
    await open(() => setUserTimeZone(zone));
    setUserTimeZone(zone);
    await newSale(user);
    choose("it-beard");
    fill("50");
    await user.click(screen.getByLabelText("Schedule"));
    fireEvent.change(screen.getByLabelText(/Starts/), { target: { value: start } });
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: end } });
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    await waitFor(() => expect(M.state.flash).toHaveLength(1));
    return M.state.flash[0];
  };

  it("stores 10:00 to 14:00 in New York (EDT, UTC-4) as the right UTC instants", async () => {
    const sale = await schedule("America/New_York", "2026-10-18T10:00", "2026-10-18T14:00");
    expect(sale.startsAt).toBe("2026-10-18T14:00:00.000Z");
    expect(sale.endsAt).toBe("2026-10-18T18:00:00.000Z");
  });

  it("stores the same wall clock in Nairobi as a different instant (UTC+3)", async () => {
    const sale = await schedule("Africa/Nairobi", "2026-10-18T10:00", "2026-10-18T14:00");
    expect(sale.startsAt).toBe("2026-10-18T07:00:00.000Z");
    expect(sale.endsAt).toBe("2026-10-18T11:00:00.000Z");
  });

  it("handles a half hour zone (Kathmandu, UTC+5:45)", async () => {
    const sale = await schedule("Asia/Kathmandu", "2026-10-18T10:00", "2026-10-18T14:00");
    expect(sale.startsAt).toBe("2026-10-18T04:15:00.000Z");
  });

  it("labels the fields with the seller's own zone, not Nairobi's", async () => {
    const user = userEvent.setup();
    await open(() => setUserTimeZone("America/New_York"));
    setUserTimeZone("America/New_York");
    await newSale(user);
    await user.click(screen.getByLabelText("Schedule"));
    expect(screen.getByLabelText(/^Starts/)).toBeInTheDocument();
    expect(screen.getByText(/Starts \(your time, GMT-4\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Nairobi/)).toBeNull();
  });
});
