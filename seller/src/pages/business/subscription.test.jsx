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
    expect(text("sum-price")).toBe("KES 500 / month");
    expect(screen.getByTestId("status-message")).toHaveTextContent("Active until 28 Feb 2026");
    expect(screen.getByTestId("status-message")).toHaveTextContent("18 days left");
    expect(screen.getByRole("img", { name: "18 of 31 days left this month" })).toBeInTheDocument();
    expect(await screen.findByText(/starts on 31 Jan runs to 28 Feb/)).toBeInTheDocument();
  });

  it("grace is one day after paid_until, then expired", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-10-05");
      setTime("2026-10-06T10:00:00Z");
    });
    expect(await screen.findByTestId("banner-grace")).toHaveTextContent("1 day of grace, until 6 Oct 2026");
    expect(text("sum-state")).toBe("Grace period");
    // Renewing in the grace day carries on from the old date: no day is lost.
    expect(await screen.findByRole("heading", { name: "Renew now", level: 2 })).toBeInTheDocument();
    expect(screen.getByTestId("payment-card")).toHaveTextContent("The new time carries on from 5 Oct 2026");
    expect(text("pay-new-date")).toBe("5 Nov 2026");
  });

  it("expired shows the expired banner", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-10-05");
      setTime("2026-10-08T10:00:00Z");
    });
    expect(await screen.findByTestId("banner-expired")).toHaveTextContent("ended on 5 Oct 2026");
    expect(text("sum-status")).toBe("Hidden until you renew");
    expect(text("sum-state")).toBe("Expired");
    // Past the grace day the new time starts today.
    expect(await screen.findByRole("heading", { name: "Renew now", level: 2 })).toBeInTheDocument();
    expect(text("pay-new-date")).toBe("8 Nov 2026");
    expect(text("pay-total")).toContain("Starts today");
  });

  it("warns when the subscription ends within 7 days", async () => {
    await signedInApp("/business/subscription", () => {
      M.state.business.paidUntil = nairobiMidnight("2026-10-12");
      setTime("2026-10-10T10:00:00Z");
    });
    expect(await screen.findByTestId("banner-expiring")).toHaveTextContent("ends in 2 days");
  });

  it("a suspended seller sees why and can still see their payments and pay; a paused seller keeps the page and sees the banner", async () => {
    const { unmount } = await signedInApp("/business/subscription", () => { M.state.business.status = "suspended"; M.state.business.statusReason = "Selling counterfeit goods"; });
    expect(await screen.findByTestId("suspended-banner")).toHaveTextContent("Selling counterfeit goods");
    expect(await screen.findByTestId("payment-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Payment history" })).toBeInTheDocument();
    expect(screen.queryByTestId("locked")).toBeNull();
    expect(screen.queryByTestId("banner-suspended")).toBeNull(); // the layout banner already says it
    expect(screen.getByRole("link", { name: "Subscription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull();
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
    expect(screen.getByRole("heading", { name: "Renew early" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("radio", { name: /^3 months/ }));
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
    expect(std).toHaveTextContent("Unlimited items");
    expect(std).toHaveTextContent("Your plan");
    expect(prem).toHaveTextContent("KES 1,500");
    expect(prem).toHaveTextContent("Unlimited items");
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

describe("Subscription: Pay now (M-Pesa prompt to the phone)", () => {
  it("renewal: the prompt goes to the listing phone, the seller only enters the PIN, and the page shows the payment by itself", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); });
    await screen.findByTestId("payment-card");
    expect(screen.getByLabelText("M-Pesa phone number")).toHaveValue("0712 345 678");
    expect(screen.getByText("Or pay with Paybill yourself")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /^3 months/ }));
    await user.click(screen.getByRole("button", { name: "Pay KES 1,500 now" }));
    expect(await screen.findByText("Check your phone")).toBeInTheDocument();
    // The prompt's amount is fixed while it waits: the months cannot be changed under it.
    expect(screen.getByRole("radio", { name: /^6 months/ })).toBeDisabled();
    expect(screen.getByText(/sent to/)).toHaveTextContent("KES 1,500 to EpicMKT, account ES100001, sent to 0712 345 678.");
    expect(await screen.findByTestId("payment-received", {}, { timeout: 15000 })).toHaveTextContent("3 months");
    expect(text("sum-paid-until")).toBe("20 Jan 2027");
  }, 30000);

  it("a different paying number can be used, and a cancelled prompt can be tried again", async () => {
    const user = userEvent.setup();
    await signedInApp();
    await screen.findByTestId("payment-card");
    const input = screen.getByLabelText("M-Pesa phone number");
    await user.clear(input);
    await user.type(input, "0722 000 110");
    await user.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    expect(await screen.findByText("Payment not completed", {}, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getByText(/You cancelled the M-Pesa request/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("M-Pesa phone number")).toHaveValue("0722 000 110");
  }, 30000);

  it("an upgrade paid by prompt is applied as the upgrade", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/subscription", () => { setTime("2026-10-05T09:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); });
    await user.click(await screen.findByRole("button", { name: "Upgrade to Premium" }));
    await screen.findByRole("heading", { name: "Upgrade to Premium", level: 2 });
    await user.click(await screen.findByRole("button", { name: "Pay KES 500 now" }));
    await waitFor(() => expect(M.state.business.planKey).toBe("premium"), { timeout: 15000 });
    expect(text("sum-paid-until")).toBe("20 Oct 2026");
  }, 30000);
});

describe("Subscription: renewing shows what you get, and only what the server will add", () => {
  const at = async (paidUntil, today = "2026-10-05T09:00:00Z") => {
    setTime(today);
    await signedInApp("/business/subscription", () => { setTime(today); M.state.business.paidUntil = paidUntil ? nairobiMidnight(paidUntil) : null; });
    await screen.findByTestId("payment-card");
  };

  it("each month choice shows its price and the paid-until date it gives; the total follows the choice", async () => {
    const user = userEvent.setup();
    await at("2026-10-20");
    const group = screen.getByRole("group", { name: "How many months do you want to pay for?" });
    expect(within(group).getAllByRole("radio").map((r) => r.closest("label").textContent)).toEqual([
      "1 monthKES 500to 20 Nov 2026", "3 monthsKES 1,500to 20 Jan 2027", "6 monthsKES 3,000to 20 Apr 2027", "11 monthsKES 5,500to 20 Sep 2027",
    ]);
    expect(screen.getByRole("radio", { name: /^1 month/ })).toBeChecked();
    expect(text("pay-total")).toContain("KES 500");
    expect(text("pay-new-date")).toBe("20 Nov 2026");
    expect(text("pay-total")).toContain("Added after 20 Oct 2026");
    await user.click(screen.getByRole("radio", { name: /^6 months/ }));
    expect(text("pay-total")).toContain("KES 3,000");
    expect(text("pay-new-date")).toBe("20 Apr 2027");
    expect(screen.getByRole("button", { name: "Pay KES 3,000 now" })).toBeInTheDocument();
  });

  it("paid well ahead: only the months that fit under 12 months ahead are offered, and the prompt asks for exactly that", async () => {
    const user = userEvent.setup();
    // 12 months from 5 Oct 2026 is 5 Oct 2027; from 20 Nov 2026 that leaves 10 whole months.
    await at("2026-11-20");
    const radios = screen.getAllByRole("radio").map((r) => r.closest("label").textContent);
    expect(radios.at(-1)).toBe("10 monthsKES 5,000to 20 Sep 2027");
    expect(radios.some((t) => t.startsWith("12 months"))).toBe(false);
    expect(text("pay-cap")).toContain("You can add up to 10 months now");
    await user.click(screen.getByRole("radio", { name: /^10 months/ }));
    await user.click(screen.getByRole("button", { name: "Pay KES 5,000 now" }));
    expect(await screen.findByText(/sent to/)).toHaveTextContent("KES 5,000 to EpicMKT");
    expect(await screen.findByTestId("payment-received", {}, { timeout: 15000 })).toHaveTextContent("10 months");
    expect(text("sum-paid-until")).toBe("20 Sep 2027");
  }, 30000);

  it("paid ahead for the most allowed: nothing to pay, no button", async () => {
    await at("2027-10-01");
    expect(screen.getByTestId("pay-full")).toHaveTextContent("You are paid ahead for the most allowed, 12 months from today, until 1 Oct 2027. There is nothing to pay now.");
    expect(screen.queryByRole("button", { name: /^Pay KES/ })).toBeNull();
    expect(screen.queryByTestId("pay-amount")).toBeNull();
  });
});

describe("Renew reminder on the other pages", () => {
  it("shows on other pages when the subscription ends within 7 days, and links to Subscription; not on Subscription itself", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions", () => { setTime("2026-10-10T10:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-12"); });
    const bar = await screen.findByTestId("renew-reminder");
    expect(bar).toHaveTextContent("Your subscription ends in 2 days.");
    await user.click(within(bar).getByRole("link", { name: "Renew now" }));
    expect(await screen.findByTestId("payment-card")).toBeInTheDocument();
    expect(screen.queryByTestId("renew-reminder")).toBeNull();
  });

  it("an expired seller sees it everywhere, and My listings says it once", async () => {
    const { unmount } = await signedInApp("/business/questions", () => { setTime("2026-10-20T10:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-05"); });
    expect(await screen.findByTestId("renew-reminder")).toHaveTextContent("Your subscription has expired.");
    unmount();
    await signedInApp("/business/catalog", () => { setTime("2026-10-20T10:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-05"); });
    const bar = await screen.findByTestId("renew-reminder");
    expect(within(bar).getByRole("link", { name: "Renew now" })).toHaveAttribute("href", "/business/subscription");
    expect(await screen.findByTestId("showing-summary")).toHaveTextContent("because your shop is not live");
    expect(screen.queryByTestId("shop-not-live")).toBeNull();
  });

  it("nothing shows while there are more than 7 days left", async () => {
    await signedInApp("/business/questions", () => { setTime("2026-10-01T10:00:00Z"); M.state.business.paidUntil = nairobiMidnight("2026-10-20"); });
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByTestId("renew-reminder")).toBeNull();
  });
});
