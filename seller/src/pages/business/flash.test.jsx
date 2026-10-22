import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import { M, signedInApp, setTime } from "../../test/utils.jsx";
import { setServerOffset } from "../../lib/clock.js";

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
    expect(screen.getByTestId("flash-quota")).toHaveTextContent("Running now: 0 of 1");
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
    expect(screen.getByTestId("flash-quota")).toHaveTextContent("Running now: 1 of 1");
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
    fireEvent.change(screen.getByLabelText(/Ends/), { target: { value: "2026-10-30T12:00" } });
    await user.click(screen.getByRole("button", { name: "Start flash sale" }));
    expect(screen.getByRole("alert")).toHaveTextContent("7 days at most");
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
    expect(screen.getByRole("group", { name: "Extend Fade cut flash sale" })).toHaveTextContent("7 days at most");
    await user.click(screen.getByRole("button", { name: "Add 1 hour" }));
    await waitFor(() => expect(M.state.flash[0].endsAt).toBe("2026-10-17T16:00:00.000Z"));
    await waitFor(() => expect(screen.getByTestId("flash-timer")).toHaveTextContent("07:00:0"));
    expect(screen.queryByRole("group", { name: "Extend Fade cut flash sale" })).toBeNull();
  });

  it("refuses an extension past 7 days with the plan message and keeps the old end time", async () => {
    const user = userEvent.setup();
    await open(() => sale("it-fade", { endsAt: "2026-10-24T08:30:00Z" }));
    await user.click(await screen.findByRole("button", { name: "Extend Fade cut flash sale" }));
    await user.click(screen.getByRole("button", { name: "Add 1 hour" }));
    expect(await screen.findByText("A flash sale can run for 7 days at most.")).toBeInTheDocument();
    expect(M.state.flash[0].endsAt).toBe("2026-10-24T08:30:00.000Z");
  });

  it("the mock only pushes an open sale later, within 7 days of its start", async () => {
    await open(() => sale("it-fade"));
    const id = M.state.flash[0].id;
    await expect(api.extendFlashSale(id, "2026-10-17T15:00:00Z")).rejects.toMatchObject({ code: "invalid_window" });
    await expect(api.extendFlashSale(id, "2026-10-17T10:00:00Z")).rejects.toMatchObject({ code: "invalid_window" });
    await expect(api.extendFlashSale(id, "not a date")).rejects.toMatchObject({ code: "invalid_window" });
    await expect(api.extendFlashSale(id, "2026-10-25T09:00:00Z")).rejects.toMatchObject({ code: "duration_too_long" });
    await expect(api.extendFlashSale("nope", "2026-10-17T16:00:00Z")).rejects.toMatchObject({ code: "not_found" });
    await api.endFlashSale(id);
    await expect(api.extendFlashSale(id, "2026-10-17T16:00:00Z")).rejects.toMatchObject({ code: "flash_closed" });
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
