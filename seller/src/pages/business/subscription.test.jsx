import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { categoryChangeQuote } from "@epicmkt/shared/billing";
import { M, signedInApp, setTime, nairobiMidnight } from "../../test/utils.jsx";

const text = (id) => screen.getByTestId(id).textContent;
const firstPayment = () => { M.state.payments = []; M.setBusiness({ status: "pending", paidUntil: null }); };

describe("Subscription: summary, calendar months and grace", () => {
  it("shows plan, status, paid until and days left; 31 Jan runs to 28 Feb", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-02-28");
      setTime("2026-02-10T09:00:00Z");
    });
    expect(await screen.findByTestId("sum-plan")).toHaveTextContent("Standard · Barber");
    expect(text("sum-status")).toBe("Live");
    expect(text("sum-state")).toBe("Active");
    expect(text("sum-paid-until")).toBe("28 Feb 2026");
    expect(text("sum-days")).toBe("18");
    expect(screen.getByText(/starts on 31 Jan runs to 28 Feb/)).toBeInTheDocument();
  });

  it("grace is one day after paid_until, then expired", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-10-05");
      setTime("2026-10-06T10:00:00Z");
    });
    expect(await screen.findByTestId("banner-grace")).toHaveTextContent("1 day of grace, until 6 Oct 2026");
    expect(text("sum-state")).toBe("Grace period");
    expect(text("sum-days")).toBe("6 Oct 2026");
  });

  it("expired shows the expired banner", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-10-05");
      setTime("2026-10-08T10:00:00Z");
    });
    expect(await screen.findByTestId("banner-expired")).toHaveTextContent("ended on 5 Oct 2026");
    expect(text("sum-state")).toBe("Expired");
    expect(text("sum-days")).toBe("0");
  });

  it("warns when the subscription ends within 7 days", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-10-12");
      setTime("2026-10-10T10:00:00Z");
    });
    expect(await screen.findByTestId("banner-expiring")).toHaveTextContent("ends in 2 days");
  });

  it("suspended and unlisted sellers keep the page and see their banner", async () => {
    const { unmount } = await signedInApp("/business/subscription", () => M.state.business.status = "suspended");
    expect(await screen.findByTestId("banner-suspended")).toHaveTextContent("still renew, read your notifications and answer questions");
    expect(await screen.findByTestId("payment-card")).toBeInTheDocument();
    unmount();
    await signedInApp("/business/subscription", () => M.state.business.status = "paused");
    expect(await screen.findByTestId("banner-paused")).toHaveTextContent("unlisted");
    expect(await screen.findByTestId("payment-card")).toBeInTheDocument();
  });
});

describe("Subscription: the payment card", () => {
  beforeEach(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue() }, configurable: true }); });

  it("first payment: application pay code as account, price at submission as amount", async () => {
    await signedInApp("/business/subscription", firstPayment);
    await screen.findByTestId("payment-card");
    expect(screen.getByRole("heading", { name: "Pay for your first month" })).toBeInTheDocument();
    expect(text("pay-number")).toContain("247247");
    expect(text("pay-name")).toBe("EpicMKT Ltd");
    expect(text("pay-account")).toContain("EPM-2026-ABC234");
    expect(text("pay-amount")).toContain("KES 450");
  });

  it("renewal: Seller ID as account, current plan price as amount", async () => {
    await signedInApp();
    await screen.findByTestId("payment-card");
    expect(screen.getByRole("heading", { name: "Renew your subscription" })).toBeInTheDocument();
    expect(text("pay-account")).toContain("ES100001");
    expect(text("pay-amount")).toContain("KES 500");
  });

  it("upgrade: the prorated difference from the category change quote", async () => {
    const user = userEvent.setup();
    let paid;
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); paid = M.state.business.paidUntil; });
    await user.click(await screen.findByRole("button", { name: "Upgrade to Premium" }));
    await screen.findByRole("heading", { name: "Upgrade to Premium", level: 2 });
    const expected = categoryChangeQuote({ oldPrice: 500, newPrice: 1500, paidUntil: paid, now: new Date("2026-10-05T09:00:00Z") }).extraDueNow;
    expect(expected).toBe(500);
    await waitFor(() => expect(text("pay-amount")).toContain(`KES ${expected.toLocaleString("en-KE")}`));
    expect(text("pay-account")).toContain("ES100001");
  });

  it("upgrade is blocked until the subscription is active", async () => {
    await signedInApp("/business/subscription", () => { setTime("2026-10-08T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-05"); });
    expect(await screen.findByRole("button", { name: "Upgrade to Premium" })).toBeDisabled();
  });

  it("category change payment: dearer category amount", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); });
    await screen.findByRole("option", { name: /Salon/ });
    await user.selectOptions(screen.getByLabelText("New category"), "salon");
    expect(await screen.findByTestId("category-quote")).toHaveTextContent("Pay KES 150 now");
    expect(screen.getByTestId("category-quote")).toHaveTextContent("KES 800 per month from your next renewal");
    await user.click(screen.getByRole("button", { name: "Request change" }));
    const pending = await screen.findByTestId("category-pending");
    expect(pending).toHaveTextContent("Waiting for admin approval");
    await user.click(within(pending).getByRole("button", { name: "Pay KES 150" }));
    await screen.findByRole("heading", { name: "Pay for your category change" });
    await waitFor(() => expect(text("pay-amount")).toContain("KES 150"));
    expect(text("pay-account")).toContain("ES100001");
  });

  it("cheaper category: nothing to pay now, applies from the next renewal, shows pending", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await screen.findByRole("option", { name: /Kiosk/ });
    await user.selectOptions(screen.getByLabelText("New category"), "kiosk");
    const q = await screen.findByTestId("category-quote");
    expect(q).toHaveTextContent("Nothing to pay now");
    expect(q).toHaveTextContent("KES 300 per month from your next renewal");
    await user.click(screen.getByRole("button", { name: "Request change" }));
    const pending = await screen.findByTestId("category-pending");
    expect(pending).toHaveTextContent("Nothing to pay now");
    expect(within(pending).queryByRole("button", { name: /^Pay/ })).toBeNull();
    await user.click(within(pending).getByRole("button", { name: "Cancel request" }));
    await screen.findByLabelText("New category");
  });

  it("copy buttons copy the paybill, account number and amount", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(navigator.clipboard, "writeText");
    await signedInApp();
    await screen.findByTestId("payment-card");
    await user.click(screen.getByRole("button", { name: "Copy paybill number" }));
    await user.click(screen.getByRole("button", { name: "Copy account number" }));
    await user.click(screen.getByRole("button", { name: "Copy amount" }));
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["247247", "ES100001", "500"]);
  });

  it("explains the steps with the right numbers", async () => {
    await signedInApp();
    await screen.findByTestId("payment-card");
    const steps = screen.getByTestId("payment-card").querySelector("ol");
    expect(steps.children).toHaveLength(5);
    expect(steps).toHaveTextContent("Enter the Paybill number 247247");
    expect(steps).toHaveTextContent("Type ES100001 as the account number");
    expect(steps).toHaveTextContent("exact amount, KES 500");
  });

  it("without the Paybill setting: we will send the details by SMS, the code field still works", async () => {
    await signedInApp("/business/subscription", () => { M.state.paybill = null; });
    expect(await screen.findByTestId("pay-pending-details")).toHaveTextContent("We will send you the payment details by SMS shortly.");
    expect(screen.queryByTestId("pay-account")).toBeNull();
    expect(screen.getByLabelText("M-Pesa transaction code")).toBeInTheDocument();
  });
});

describe("Subscription: I have paid, duplicate codes and live updates", () => {
  it("rejects a badly formatted code before sending", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await user.type(await screen.findByLabelText("M-Pesa transaction code"), "abc12");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("10 character M-Pesa code");
    expect(M.state.payments.filter((p) => p.status === "submitted")).toHaveLength(0);
  });

  it("refuses a code already used on another business", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await user.type(await screen.findByLabelText("M-Pesa transaction code"), "otherbiz01");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already been used");
    expect(M.state.payments.some((p) => p.mpesaCode === "OTHERBIZ01")).toBe(false);
    expect(screen.queryByTestId("payment-confirming")).toBeNull();
  });

  it("records the code as submitted and shows Payment under confirmation", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await user.type(await screen.findByLabelText("M-Pesa transaction code"), "abcd123456");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    const card = await screen.findByTestId("payment-confirming");
    expect(card).toHaveTextContent("Payment under confirmation");
    expect(card).toHaveTextContent("ABCD123456");
    const row = M.state.payments.find((p) => p.mpesaCode === "ABCD123456");
    expect([row.status, row.amount, row.accountRef, row.kind]).toEqual(["submitted", 500, "ES100001", "renewal"]);
  });

  it("updates by itself when the payment is confirmed: Payment received and the new paid_until, no reload", async () => {
    const user = userEvent.setup();
    setTime("2026-10-05T09:00:00Z");
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); });
    await user.type(await screen.findByLabelText("M-Pesa transaction code"), "LIVE123456");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await screen.findByTestId("payment-confirming");
    expect(text("sum-paid-until")).toBe("20 Oct 2026");

    const id = M.state.payments.find((p) => p.mpesaCode === "LIVE123456").id;
    act(() => { M.confirmPayment(id, "auto"); });

    const received = await screen.findByTestId("payment-received");
    expect(received).toHaveTextContent("Payment received");
    expect(received).toHaveTextContent("paid until 20 Nov 2026");
    await waitFor(() => expect(text("sum-paid-until")).toBe("20 Nov 2026"));
    expect(screen.queryByTestId("payment-confirming")).toBeNull();
    const rows = screen.getAllByTestId("payment-row");
    expect(within(rows[0]).getByText("Payment received")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: /^EPM-R-/ })).toBeInTheDocument();
  });

  it("an admin confirmation looks the same as an automatic one", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await user.type(await screen.findByLabelText("M-Pesa transaction code"), "ADMIN12345");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await screen.findByTestId("payment-confirming");
    act(() => { M.confirmPayment(M.state.payments[0].id, "admin"); });
    expect(await screen.findByTestId("payment-received")).toBeInTheDocument();
  });

  it("an upgrade confirmed in the background switches the plan on screen", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); });
    await user.click(await screen.findByRole("button", { name: "Upgrade to Premium" }));
    await waitFor(() => expect(text("pay-amount")).toContain("KES 500"));
    await user.type(screen.getByLabelText("M-Pesa transaction code"), "UPGRADE123");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await screen.findByTestId("payment-confirming");
    act(() => { M.confirmPayment(M.state.payments[0].id); });
    await waitFor(() => expect(text("sum-plan")).toContain("Premium"));
  });

  it("a rejected payment returns to the card so the seller can try again", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await user.type(await screen.findByLabelText("M-Pesa transaction code"), "WRONG12345");
    await user.click(screen.getByRole("button", { name: "I have paid" }));
    await screen.findByTestId("payment-confirming");
    act(() => { M.rejectPayment(M.state.payments[0].id, "No such transaction"); });
    await screen.findByTestId("payment-card");
    expect(within(screen.getAllByTestId("payment-row")[0]).getByText("Not matched")).toBeInTheDocument();
  });
});

describe("Subscription: plans for the seller's own category and history", () => {
  it("compares Standard and Premium of the seller's category from the plan tables", async () => {
    await signedInApp();
    const std = await screen.findByTestId("plan-standard");
    const prem = screen.getByTestId("plan-premium");
    expect(std).toHaveTextContent("KES 500");
    expect(std).toHaveTextContent("30 items");
    expect(std).toHaveTextContent("Your plan");
    expect(prem).toHaveTextContent("KES 1,500");
    expect(prem).toHaveTextContent("100 items");
    expect(prem).toHaveTextContent("Featured badge");
    expect(prem).toHaveTextContent("Best value");
    expect(screen.getByRole("heading", { name: /Standard or Premium for Barber/ })).toBeInTheDocument();
    expect(prem).not.toHaveTextContent("Salon");
  });

  it("history rows carry labels so the table can stack into cards on phones", async () => {
    await signedInApp();
    const table = await screen.findByTestId("payment-history");
    const row = within(table).getAllByTestId("payment-row")[0];
    expect(row).toHaveTextContent("KES 500");
    expect(row).toHaveTextContent("QA11BB22CC");
    expect(row).toHaveTextContent("20 Aug 2026 to 20 Sep 2026");
    const labels = [...row.querySelectorAll("td")].map((td) => td.getAttribute("data-label"));
    expect(labels).toEqual(["Date", "Amount", "M-Pesa code", "Period covered", "Status", "Receipt"]);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Date", "Amount", "M-Pesa code", "Period covered", "Status", "Receipt"]);
  });
});
