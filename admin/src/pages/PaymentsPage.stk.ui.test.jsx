import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "finance";
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole } }) }));
const api = { getPayments: vi.fn(), getUnprocessedCallbacks: vi.fn(), getStkRequests: vi.fn(), resolveStkRequest: vi.fn() };
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: PaymentsPage } = await import("./PaymentsPage.jsx");

const STK = [
  { id: "s1", status: "paid", purpose: "renewal", months: 3, amount: 1500, phone: "254712345678", businessName: "Pwani Pastries", reference: "ES100210", town: "Mombasa", receipt: "SK41PQ7RT2", paidAmount: 1500, verification: "query_ok", by: "seller", at: "2026-10-18T09:10:00Z" },
  { id: "s2", status: "failed", purpose: "first", months: 1, amount: 500, phone: "254722000111", businessName: "Bustani Foods", reference: "EPM-2026-QRS552", resultDesc: "Request cancelled by user", by: "applicant", at: "2026-10-18T08:55:00Z" },
  { id: "s3", status: "disputed", purpose: "renewal", months: 1, amount: 500, phone: "254733000222", businessName: "Kilele Hardware", reference: "ES100301", paidAmount: 5000, note: "the amount (5000) differs from the amount asked (500)", by: "seller", at: "2026-10-18T07:30:00Z" },
];

const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/admin/payments"]}><PaymentsPage /></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  mockRole = "finance";
  for (const f of Object.values(api)) f.mockReset();
  api.getPayments.mockResolvedValue([]);
  api.getUnprocessedCallbacks.mockResolvedValue([]);
  api.getStkRequests.mockResolvedValue(STK);
  api.resolveStkRequest.mockResolvedValue({ outcome: "applied" });
});

describe("Payments: phone prompts (Pay now)", () => {
  it("lists every prompt with its amount, phone, answer and receipt", async () => {
    mount();
    const panel = (await screen.findByRole("heading", { name: "Phone prompts (Pay now)" })).closest("section");
    expect(await within(panel).findByText("Pwani Pastries")).toBeInTheDocument();
    expect(within(panel).getByText("SK41PQ7RT2")).toBeInTheDocument();
    expect(within(panel).getByText("0712 345 678")).toBeInTheDocument();
    expect(within(panel).getByText("Request cancelled by user")).toBeInTheDocument();
    expect(within(panel).getByText("Callback said KES 5,000")).toBeInTheDocument();
    expect(within(panel).getByText("1 need checking.")).toBeInTheDocument();
  });

  it("finance credits a disputed prompt from the statement, with a receipt and a reason", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Check and resolve" }));
    const credit = screen.getByRole("button", { name: "Credit this payment" });
    expect(credit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("M-Pesa receipt from the statement"), { target: { value: "sk99zz88yy" } });
    fireEvent.change(screen.getByLabelText("Reason (kept in the audit log)"), { target: { value: "Checked the statement" } });
    fireEvent.click(credit);
    await waitFor(() => expect(api.resolveStkRequest).toHaveBeenCalledWith({ id: "s3", action: "credit", receipt: "SK99ZZ88YY", amount: 500, reason: "Checked the statement" }));
    expect(await screen.findByText("Credited SK99ZZ88YY to Kilele Hardware.")).toBeInTheDocument();
  });

  it("a support admin can look but not resolve", async () => {
    mockRole = "support";
    mount();
    expect(await screen.findByRole("button", { name: "Check and resolve" })).toBeDisabled();
  });
});
