import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { receiptModel } from "@epicmkt/shared/billing";
import { M, signedInApp } from "../../test/utils.jsx";

const css = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

describe("printable receipt", () => {
  it("shows business, category, plan, amount, code, timestamp, period, receipt number and EpicMKT details", async () => {
    await signedInApp("/business/subscription/receipts/pay-1");
    const sheet = await screen.findByTestId("receipt");
    const rows = Object.fromEntries([...sheet.querySelectorAll("dl > div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent]));
    expect(rows).toMatchObject({
      "Receipt number": "EPM-R-2026-000001",
      Business: "Demo Shop",
      "Seller ID": "ES100001",
      Category: "Barber",
      Plan: "Standard",
      For: "Renewal",
      Amount: "KES 500",
      "M-Pesa code": "QA11BB22CC",
      "Period covered": "20 Aug 2026 to 20 Sep 2026",
    });
    expect(rows["Paid on"]).toMatch(/^\d{1,2} [A-Z][a-z]{2} 2026, \d\d:\d\d EAT$/);
    expect(within(sheet).getByTestId("receipt-issuer")).toHaveTextContent("EpicMKT");
    expect(within(sheet).getByRole("heading", { name: "Payment receipt" })).toBeInTheDocument();
  });

  it("prints with the browser's print dialog", async () => {
    const user = userEvent.setup();
    window.print = vi.fn();
    await signedInApp("/business/subscription/receipts/pay-1");
    await user.click(await screen.findByRole("button", { name: "Print receipt" }));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it("is only for confirmed payments of this seller", async () => {
    await signedInApp("/business/subscription/receipts/pay-nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("could not find that receipt");
    expect(screen.queryByTestId("receipt")).toBeNull();
  });

  it("a submitted payment has no receipt", async () => {
    await signedInApp("/business/subscription/receipts/pay-9", () => {
      M.state.payments.unshift({ id: "pay-9", status: "submitted", amount: 500, kind: "renewal", mpesaCode: "SUBMIT0001", createdAt: new Date().toISOString() });
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("the print stylesheet hides the app chrome and forces black on white", () => {
    const r = css("./receipt.module.css");
    const print = r.slice(r.indexOf("@media print"));
    expect(print).toContain("@page");
    expect(print).toMatch(/background:\s*#fff/);
    expect(print).toMatch(/color:\s*#000/);
    expect(css("../../components/Layout.module.css")).toMatch(/@media print\s*{\s*\.header\s*{\s*display:\s*none/);
    expect(css("../../styles/ui.module.css")).toMatch(/@media print[\s\S]*\.noPrint[\s\S]*display:\s*none/);
  });

  it("receiptModel leaves out nothing it promises", () => {
    const m = receiptModel({
      payment: { receiptNo: "R1", amount: 1500, kind: "upgrade", planKey: "premium", mpesaCode: "ABCDEFGHIJ", confirmedAt: "2026-02-28T07:05:00Z", periodStart: "2026-01-31", periodEnd: "2026-02-28" },
      business: { name: "Shop", sellerId: "ES1", planKey: "standard" }, categoryName: "Barber", issuer: { name: "EpicMKT" },
    });
    expect(m).toMatchObject({ receiptNo: "R1", businessName: "Shop", category: "Barber", plan: "Premium", purpose: "Upgrade to Premium", amountText: "KES 1,500", mpesaCode: "ABCDEFGHIJ", period: "31 Jan 2026 to 28 Feb 2026", paidAt: "28 Feb 2026, 10:05 EAT" });
  });
});
