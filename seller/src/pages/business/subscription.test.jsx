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

  it("a suspended seller is locked out and sees why; a paused seller keeps the page and sees the banner", async () => {
    const { unmount } = await signedInApp("/business/subscription", () => { M.state.business.status = "suspended"; M.state.business.statusReason = "Selling counterfeit goods"; });
    expect(await screen.findByTestId("suspended-banner")).toHaveTextContent("Selling counterfeit goods");
    expect(await screen.findByTestId("locked")).toBeInTheDocument();
    expect(screen.queryByTestId("payment-card")).toBeNull();
    expect(screen.queryByRole("link", { name: "Subscription" })).toBeNull();
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

  it("explains the steps with the right numbers and asks for no code", async () => {
    await signedInApp();
    await screen.findByTestId("payment-card");
    const steps = screen.getByTestId("payment-card").querySelector("ol");
    expect(steps.children).toHaveLength(4);
    expect(steps).toHaveTextContent("Enter the Paybill number 247247");
    expect(steps).toHaveTextContent("Type ES100001 as the account number");
    expect(steps).toHaveTextContent("amount, KES 500");
    expect(screen.getByTestId("payment-card")).toHaveTextContent("You do not need to send us any code");
  });

  it("without the Paybill setting: we will send the details by SMS", async () => {
    await signedInApp("/business/subscription", () => { M.state.paybill = null; });
    expect(await screen.findByTestId("pay-pending-details")).toHaveTextContent("We will send you the payment details by SMS shortly.");
    expect(screen.queryByTestId("pay-account")).toBeNull();
  });
});

describe("Subscription: payments arrive by themselves", () => {
  const ready = async (paidUntil = "2026-10-20") => {
    setTime("2026-10-05T09:00:00Z");
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight(paidUntil); });
    await screen.findByTestId("payment-card");
  };

  it("has no code field and no I have paid button anywhere", async () => {
    await ready();
    expect(screen.queryByLabelText("M-Pesa transaction code")).toBeNull();
    expect(screen.queryByRole("button", { name: "I have paid" })).toBeNull();
  });

  it("a renewal that arrives shows Payment received and the new paid until date, with no reload", async () => {
    await ready();
    expect(text("sum-paid-until")).toBe("20 Oct 2026");
    act(() => { M.autoPay(500); });
    const received = await screen.findByTestId("payment-received");
    expect(received).toHaveTextContent("Payment received");
    expect(received).toHaveTextContent("paid until 20 Nov 2026");
    await waitFor(() => expect(text("sum-paid-until")).toBe("20 Nov 2026"));
    const rows = screen.getAllByTestId("payment-row");
    expect(within(rows[0]).getByText("Payment received")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: /^EPM-R-/ })).toBeInTheDocument();
  });

  it("KES 1,500 on a 500 plan adds three months at once", async () => {
    await ready();
    act(() => { M.autoPay(1500); });
    const received = await screen.findByTestId("payment-received");
    expect(received).toHaveTextContent("covers 3 months");
    expect(received).toHaveTextContent("paid until 20 Jan 2027");
    await waitFor(() => expect(text("sum-paid-until")).toBe("20 Jan 2027"));
  });

  it("choosing 3 months shows KES 1,500 and copies that amount", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(navigator.clipboard, "writeText");
    await ready();
    await user.selectOptions(screen.getByLabelText("How many months do you want to pay for?"), "3");
    expect(text("pay-amount")).toContain("KES 1,500");
    await user.click(screen.getByRole("button", { name: "Copy amount" }));
    expect(spy.mock.calls.at(-1)[0]).toBe("1500");
  });

  it("a part payment is kept as credit: the card says so and asks only for the rest", async () => {
    await ready();
    act(() => { M.autoPay(300); });
    const credit = await screen.findByTestId("pay-credit");
    expect(credit).toHaveTextContent("KES 300");
    expect(credit).toHaveTextContent("you only need to pay KES 200");
    await waitFor(() => expect(text("pay-amount")).toContain("KES 200"));
    expect(text("sum-paid-until")).toBe("20 Oct 2026");
    act(() => { M.autoPay(200); });
    expect(await screen.findByTestId("payment-received")).toHaveTextContent("paid until 20 Nov 2026");
  });

  it("an overpayment renews whole months and keeps the rest as credit", async () => {
    const user = userEvent.setup();
    await ready();
    act(() => { M.autoPay(1600); });
    await screen.findByTestId("payment-received");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByTestId("pay-credit")).toHaveTextContent("KES 100");
  });

  it("money paid for an upgrade is applied as the upgrade, not as a renewal month", async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(await screen.findByRole("button", { name: "Upgrade to Premium" }));
    await waitFor(() => expect(text("pay-amount")).toContain("KES 500"));
    act(() => { M.autoPay(500); });
    await waitFor(() => expect(text("sum-plan")).toContain("Premium"));
    expect(text("sum-paid-until")).toBe("20 Oct 2026");
    expect(await screen.findByTestId("payment-received")).toBeInTheDocument();
  });

  it("a part payment toward an upgrade is held, not turned into a renewal", async () => {
    const user = userEvent.setup();
    await ready();
    await user.click(await screen.findByRole("button", { name: "Upgrade to Premium" }));
    await waitFor(() => expect(text("pay-amount")).toContain("KES 500"));
    act(() => { M.autoPay(300); });
    await waitFor(() => expect(text("pay-amount")).toContain("KES 200"));
    expect(text("sum-plan")).toContain("Standard");
    expect(text("sum-paid-until")).toBe("20 Oct 2026");
  });

  it("credit that is already there can be used for the upgrade with one button", async () => {
    const user = userEvent.setup();
    await ready();
    M.setBusiness({ creditKes: 600 });
    await user.click(await screen.findByRole("button", { name: "Upgrade to Premium" }));
    await user.click(await screen.findByRole("button", { name: "Use my KES 500 credit" }));
    await waitFor(() => expect(text("sum-plan")).toContain("Premium"));
  });

  it("an admin confirmation of a payment they recorded looks the same", async () => {
    await ready();
    M.state.payments.unshift({ id: "pay-admin", businessId: "biz-1", amount: 500, kind: "renewal", status: "submitted", mpesaCode: "ADMIN12345", planKey: "standard", categoryId: "barber",
      accountRef: "ES100001", confirmedVia: null, declineReason: null, receiptNo: null, periodStart: null, periodEnd: null, months: 1, submittedAt: "2026-10-05T08:00:00Z", confirmedAt: null, createdAt: "2026-10-05T08:00:00Z" });
    M.emit("payments");
    await screen.findByTestId("payment-confirming");
    act(() => { M.confirmPayment("pay-admin", "admin"); });
    expect(await screen.findByTestId("payment-received")).toBeInTheDocument();
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
