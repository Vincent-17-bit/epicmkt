import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PayByPhone from "./PayByPhone.jsx";

const req = (over = {}) => ({ id: "r1", status: "pending", message: "A payment request is on your phone. Enter your M-Pesa PIN there to pay.", amount: 500, account: "ES100001", phone: "254712345678", ...over });

function setup(props = {}) {
  const start = vi.fn(async () => ({ request: req() }));
  const poll = vi.fn(async () => ({ request: req() }));
  const onPaid = vi.fn();
  const onFallback = vi.fn();
  render(<PayByPhone amount={500} defaultPhone="+254712345678" start={start} poll={poll} onPaid={onPaid} onFallback={onFallback} pollMs={5} {...props} />);
  return { start, poll, onPaid, onFallback };
}

describe("PayByPhone", () => {
  it("prefills the number on file, sends only the phone, and shows exactly what was asked of Safaricom", async () => {
    const { start } = setup();
    const input = screen.getByLabelText("M-Pesa phone number");
    expect(input).toHaveValue("0712 345 678");
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    await screen.findByText("Check your phone");
    expect(start).toHaveBeenCalledWith({ phone: "254712345678" });
    expect(screen.getByRole("status")).toHaveTextContent("account ES100001, sent to 0712 345 678");
  });

  it("refuses a number that is not Safaricom before anything is sent", () => {
    const { start } = setup({ defaultPhone: "" });
    fireEvent.change(screen.getByLabelText("M-Pesa phone number"), { target: { value: "0812 345 678" } });
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a Safaricom M-Pesa number");
    expect(start).not.toHaveBeenCalled();
  });

  it("polls until the payment is recorded, then reports the receipt once", async () => {
    let n = 0;
    const poll = vi.fn(async () => ({ request: ++n < 3 ? req() : req({ status: "paid", message: "Thank you. Your payment is recorded.", receipt: "SK12345678", outcome: { outcome: "applied", months: 1, paidUntil: "2026-12-16" } }) }));
    const { onPaid } = setup({ poll, formatDay: () => "16 Dec 2026" });
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    await screen.findByText("Payment received");
    expect(screen.getByRole("status")).toHaveTextContent("M-Pesa receipt SK12345678");
    expect(screen.getByRole("status")).toHaveTextContent("1 month added, paid until 16 Dec 2026.");
    await new Promise((r) => setTimeout(r, 30));
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(poll.mock.calls.length).toBe(3);
  });

  it("a cancelled prompt says so and offers to try again with the number kept", async () => {
    const poll = vi.fn(async () => ({ request: req({ status: "failed", resultCode: "1032", message: "You cancelled the M-Pesa request. Nothing was charged." }) }));
    setup({ poll });
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    await screen.findByText("Payment not completed");
    expect(screen.getByRole("status")).toHaveTextContent("Nothing was charged");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("M-Pesa phone number")).toHaveValue("0712 345 678");
  });

  it("when paying by prompt is not available, says why and hands over to Paybill", async () => {
    const start = vi.fn(async () => { const e = new Error("Paying by phone prompt is not available right now. Pay with Paybill instead."); e.code = "stk_not_configured"; throw e; });
    const { onFallback } = setup({ start });
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pay with Paybill instead");
    expect(onFallback).toHaveBeenCalledWith("stk_not_configured");
  });

  it("a disputed payment tells the payer not to pay again and offers no retry", async () => {
    const poll = vi.fn(async () => ({ request: req({ status: "disputed", message: "We are checking this payment with Safaricom. We will confirm it shortly; do not pay again." }) }));
    setup({ poll });
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    await screen.findByText("We are checking this payment");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("uses the app's own button classes when given, so it matches the page", async () => {
    const { start } = setup({ buttonClassName: "app-btn", secondaryButtonClassName: "app-ghost" });
    const pay = screen.getByRole("button", { name: "Pay KES 500 now" });
    expect(pay.className).toContain("app-btn");
    expect(pay).toHaveAttribute("type", "submit");
    fireEvent.click(pay);
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect((await screen.findByRole("button", { name: "Use a different number" })).className).toContain("app-ghost");
  });

  it("tells the caller when a prompt starts and stops waiting, including when it is taken off the page", async () => {
    const onWaitingChange = vi.fn();
    const start = vi.fn(async () => ({ request: req() }));
    const { unmount } = render(<PayByPhone amount={500} defaultPhone="0712345678" start={start} poll={vi.fn(async () => ({ request: req() }))} pollMs={60_000} onWaitingChange={onWaitingChange} />);
    expect(onWaitingChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    await waitFor(() => expect(onWaitingChange).toHaveBeenLastCalledWith(true));
    unmount();
    expect(onWaitingChange).toHaveBeenLastCalledWith(false);
  });

  it("can be disabled with a reason", () => {
    setup({ disabled: true, disabledReason: "Wait for the payment you reported to be checked." });
    expect(screen.getByRole("button", { name: "Pay KES 500 now" })).toBeDisabled();
    expect(screen.getByText("Wait for the payment you reported to be checked.")).toBeInTheDocument();
  });

  it("stops polling after the wait and lets the payer check again", async () => {
    let t = 0;
    const now = () => t;
    const poll = vi.fn(async () => ({ request: req() }));
    setup({ poll, now });
    fireEvent.click(screen.getByRole("button", { name: "Pay KES 500 now" }));
    await screen.findByText("Check your phone");
    await act(async () => { t = 200_000; await new Promise((r) => setTimeout(r, 30)); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Send the prompt again" })).toBeInTheDocument();
    const calls = poll.mock.calls.length;
    await new Promise((r) => setTimeout(r, 30));
    expect(poll.mock.calls.length).toBe(calls);
  });
});
