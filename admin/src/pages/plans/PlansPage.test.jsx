import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../components/Toast.jsx";
import { __resetMockPlans } from "../../api/mockPlans.js";
import PlansPage from "./PlansPage.jsx";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>
          <Link to="/elsewhere">Elsewhere</Link>
          <PlansPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const replace = async (user, el, text) => {
  await user.clear(el);
  if (text) await user.type(el, text);
};

describe("PlansPage", () => {
  beforeEach(() => __resetMockPlans());

  it("shows a loading state, then the editor and the live preview", async () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent(/loading plans/i);
    expect(await screen.findByRole("heading", { name: "Edit plans" })).toBeInTheDocument();
    const preview = screen.getByRole("region", { name: /live preview/i });
    expect(within(preview).getByRole("radiogroup", { name: /packages for water refill station/i })).toBeInTheDocument();
    expect(within(preview).getAllByText("KES 300").length).toBeGreaterThan(0);
  });

  it("updates the preview as you type and shows who is affected", async () => {
    const user = userEvent.setup();
    setup();
    const price = await screen.findByLabelText("Price per month (KES)", { selector: "#standard-price" });
    await replace(user, price, "350");
    const preview = screen.getByRole("region", { name: /live preview/i });
    expect(within(preview).getAllByText("KES 350").length).toBeGreaterThan(0);
    const note = await screen.findByRole("note", { name: /who is affected/i });
    expect(note).toHaveTextContent(/KSh 300 to KSh 350/);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("switches the preview to the Sell page table", async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole("heading", { name: "Edit plans" });
    await user.click(screen.getByRole("button", { name: "Sell page table" }));
    const preview = screen.getByRole("region", { name: /live preview/i });
    expect(within(preview).getByRole("table", { name: /comparison of standard and premium/i })).toBeInTheDocument();
  });

  it("shows trial days and the badge on the preview cards", async () => {
    const user = userEvent.setup();
    setup();
    const trial = await screen.findByLabelText("Free trial days", { selector: "#standard-trialDays" });
    await replace(user, trial, "14");
    const preview = screen.getByRole("region", { name: /live preview/i });
    expect(within(preview).getByText(/14-day free trial/)).toBeInTheDocument();
  });

  it("blocks saving on invalid input and names the problem", async () => {
    const user = userEvent.setup();
    setup();
    const price = await screen.findByLabelText("Price per month (KES)", { selector: "#premium-price" });
    await replace(user, price, "100");
    expect(await screen.findByText("Premium cannot cost less than Standard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and save" })).toBeDisabled();
    expect(screen.getByText(/1 problem to fix/)).toBeInTheDocument();
  });

  it("saves with a reason and records a version", async () => {
    const user = userEvent.setup();
    setup();
    const price = await screen.findByLabelText("Price per month (KES)", { selector: "#standard-price" });
    await replace(user, price, "350");
    await user.click(screen.getByRole("button", { name: "Review and save" }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save plans" });
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/reason/i), "Quarterly price review");
    await user.click(save);
    expect(await screen.findByText(/Plans saved/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "History" }));
    expect(await screen.findByText(/Reason: Quarterly price review/)).toBeInTheDocument();
  });

  it("asks before leaving with unsaved changes, and lets you stay", async () => {
    const user = userEvent.setup();
    setup();
    const price = await screen.findByLabelText("Price per month (KES)", { selector: "#standard-price" });
    await replace(user, price, "350");
    await user.click(screen.getByRole("link", { name: "Elsewhere" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/unsaved/i);
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Price per month (KES)", { selector: "#standard-price" })).toHaveValue("350");
  });
});
