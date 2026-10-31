import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const minutesBack = (m) => new Date(Date.now() - m * 60000).toISOString();
const api = {
  listTemplates: vi.fn(),
  sendBroadcast: vi.fn(),
  listMessageLog: vi.fn(),
  getMessageSummary: vi.fn(),
  retryMessage: vi.fn(async () => true),
  retryFailedMessages: vi.fn(async () => 2),
  saveTemplate: vi.fn(async () => 4),
  getAutomationStatus: vi.fn(),
  setJobActive: vi.fn(async () => true),
  runJob: vi.fn(async () => 1),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: BroadcastsPage } = await import("./BroadcastsPage.jsx");
const { default: AutomationPage } = await import("./AutomationPage.jsx");
const { ToastProvider } = await import("../components/Toast.jsx");

function renderPage(element, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ToastProvider>{element}</ToastProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

const previewResult = { ok: true, preview: true, recipients: 6, rows: { sms: 6, email: 0, inApp: 0 }, skipped: { sms: 1, email: 0, inApp: 0 }, notFound: 0, transactional: false, scheduledAt: new Date().toISOString(), samples: [{ channel: "sms", subject: "A message from EpicMKT", body: "Renew today Lakeside Provisions" }] };

beforeEach(() => {
  mockRole = "owner";
  api.listTemplates.mockResolvedValue([{ key: "renew_7d", channel: "sms", subject: null, body_en: "Hi {{business_name}}, ends {{paid_until}}", body_sw: null, transactional: true, version: 3, used_30d: 5 }]);
  api.sendBroadcast.mockImplementation(async (p) => (p.preview ? previewResult : { ok: true, queued: 6, rows: previewResult.rows, skipped: previewResult.skipped }));
  api.listMessageLog.mockResolvedValue({ total: 2, rows: [
    { id: "m1", created_at: minutesBack(20), channel: "sms", status: "sent", subject: "Reminder", business_id: "b1", business_name: "Lakeside Provisions", to_address: "+254712345678", attempts: 1, scheduled_at: minutesBack(20) },
    { id: "m2", created_at: minutesBack(180), channel: "sms", status: "failed", subject: "Offer", business_id: "b2", business_name: "Fade Kings", to_address: "+254722000111", attempts: 3, error: "provider_unavailable", scheduled_at: minutesBack(180) },
  ] });
  api.getMessageSummary.mockResolvedValue({ days: 7, by_status: { sent: 1, failed: 1 }, cost_kes: 0.8 });
  api.getAutomationStatus.mockResolvedValue({
    cron_installed: true, expected: ["dispatch-messages", "daily-lifecycle"],
    jobs: [
      { name: "dispatch-messages", schedule: "* * * * *", active: true, last_run: { status: "succeeded", started_at: minutesBack(1) } },
      { name: "daily-lifecycle", schedule: "0 4 * * *", active: true, last_run: { status: "succeeded", started_at: minutesBack(300) } },
    ],
    queue: { queued: 0, due_now: 0, oldest_due_at: null, failed_7d: 0 }, last_sent_at: minutesBack(2), last_reminder_at: minutesBack(300),
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Broadcast composer", () => {
  it("will not send until the exact message has been previewed", async () => {
    renderPage(<BroadcastsPage />);
    const send = await screen.findByRole("button", { name: "Send broadcast" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Renew today {{business_name}}" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText(/Renew today Lakeside Provisions/)).toBeInTheDocument();
    expect(screen.getByText(/Skipped for missing contact details: 1 SMS/)).toBeInTheDocument();
    expect(send).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Renew today, changed" } });
    expect(send).toBeDisabled();
  });

  it("sends with a confirmation and a retry-safe key, using the previewed payload", async () => {
    renderPage(<BroadcastsPage />);
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Renew today" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByText(/Skipped for missing contact details/);
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("6 messages to 6 businesses");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Renewal campaign" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send broadcast" }));
    await waitFor(() => expect(api.sendBroadcast).toHaveBeenCalledTimes(2));
    const sent = api.sendBroadcast.mock.calls[1][0];
    expect(sent).toMatchObject({ target: { segment: "expiring_7d" }, channels: { sms: true, email: false, inApp: false }, body: "Renew today", preview: false });
    expect(sent.idempotencyKey).toMatch(/^[A-Za-z0-9-]{8,80}$/);
  });

  it("asks for values a template needs and explains server refusals in words", async () => {
    api.listTemplates.mockResolvedValue([{ key: "promo", channel: "sms", subject: null, body_en: "Hi {{business_name}}: {{offer}}", body_sw: null, transactional: false, version: 1, used_30d: 0 }]);
    api.sendBroadcast.mockRejectedValueOnce(Object.assign(new Error("too_many_recipients"), { code: "too_many_recipients" }));
    renderPage(<BroadcastsPage />);
    const select = await screen.findByLabelText("Template");
    await screen.findByRole("option", { name: /promo/ });
    fireEvent.change(select, { target: { value: "promo" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fill in: offer");
    fireEvent.change(screen.getByLabelText("Value for {{offer}}"), { target: { value: "10% off" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("more than 500 businesses");
  });

  it("a reviewer can compose; finance cannot preview or send", async () => {
    mockRole = "finance";
    renderPage(<BroadcastsPage />);
    expect(await screen.findByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send broadcast" })).toBeDisabled();
  });
});

describe("Message log and templates", () => {
  it("shows failures with their cause and retries one", async () => {
    renderPage(<BroadcastsPage />, "/?tab=log");
    expect(await screen.findByText(/provider_unavailable after 3 tries/)).toBeInTheDocument();
    expect(screen.getByText(/SMS cost KES 0.8/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry message to Fade Kings" }));
    await waitFor(() => expect(api.retryMessage).toHaveBeenCalledWith("m2"));
    fireEvent.click(screen.getByRole("button", { name: "Retry all failed" }));
    await waitFor(() => expect(api.retryFailedMessages).toHaveBeenCalled());
  });

  it("the owner edits a template; others see it disabled with the reason", async () => {
    renderPage(<BroadcastsPage />, "/?tab=templates");
    fireEvent.click(await screen.findByRole("button", { name: "Edit template renew_7d" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("English"), { target: { value: "Hi {{business_name}}, renew by {{paid_until}}." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ key: "renew_7d", channel: "sms", bodyEn: "Hi {{business_name}}, renew by {{paid_until}}." })));
    cleanup();
    mockRole = "support";
    renderPage(<BroadcastsPage />, "/?tab=templates");
    const edit = await screen.findByRole("button", { name: "Edit template renew_7d" });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute("title", expect.stringContaining("Only Owners"));
  });
});

describe("Automation", () => {
  it("running normally: both jobs active and no warnings", async () => {
    renderPage(<AutomationPage />);
    expect(await screen.findByText("Running normally")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Problems" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run now: Send queued messages" }));
    await waitFor(() => expect(api.runJob).toHaveBeenCalledWith("dispatch-messages"));
  });

  it("silently off: says so loudly, with the fix", async () => {
    api.getAutomationStatus.mockResolvedValue({ cron_installed: false, expected: ["dispatch-messages", "daily-lifecycle"], jobs: [], queue: { queued: 9, due_now: 9, oldest_due_at: minutesBack(90), failed_7d: 0 }, last_sent_at: null, last_reminder_at: null });
    renderPage(<AutomationPage />);
    expect(await screen.findByText("Not running")).toBeInTheDocument();
    const problems = screen.getByRole("list", { name: "Problems" });
    expect(within(problems).getByText(/scheduler \(pg_cron\) is not installed/)).toBeInTheDocument();
    expect(within(problems).getByText(/9 messages have been waiting to send for 1 hours|9 messages have been waiting/)).toBeInTheDocument();
    expect(screen.getAllByText("Not scheduled")).toHaveLength(2);
  });

  it("pauses a job, and non-owners cannot", async () => {
    renderPage(<AutomationPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause Send queued messages" }));
    await waitFor(() => expect(api.setJobActive).toHaveBeenCalledWith({ name: "dispatch-messages", active: false }));
    cleanup();
    mockRole = "reviewer";
    renderPage(<AutomationPage />);
    expect(await screen.findByRole("button", { name: "Pause Send queued messages" })).toBeDisabled();
  });
});
