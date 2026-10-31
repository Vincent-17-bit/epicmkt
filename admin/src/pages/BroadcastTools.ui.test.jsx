import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "owner";
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const api = {
  listTemplates: vi.fn(),
  listMessageLog: vi.fn(),
  getMessageSummary: vi.fn(),
  getMessageDetail: vi.fn(),
  listPendingBroadcasts: vi.fn(),
  cancelBroadcast: vi.fn(),
  setTemplateEnabled: vi.fn(async () => true),
  deleteTemplate: vi.fn(async () => true),
  getBusinessFilterOptions: vi.fn(),
  sendBroadcast: vi.fn(),
  retryMessage: vi.fn(),
  retryFailedMessages: vi.fn(),
  saveTemplate: vi.fn(),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: BroadcastsPage } = await import("./BroadcastsPage.jsx");
const { ToastProvider } = await import("../components/Toast.jsx");

function renderPage(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ToastProvider><BroadcastsPage /></ToastProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

const batch = { batch_id: "bt1", created_at: "2026-10-31T06:00:00Z", scheduled_at: "2026-11-01T09:30:00Z", subject: "Weekend offer", template_key: null, pending: 6, sent: 2, total: 8, recipients: 4, channels: ["sms", "email"] };
const preview = { ok: true, preview: true, recipients: 3, rows: { sms: 3, email: 0, inApp: 0 }, skipped: { sms: 0, email: 0, inApp: 0 }, notFound: 0, transactional: false, scheduledAt: "2026-10-31T09:00:00Z", samples: [] };

beforeEach(() => {
  mockRole = "owner";
  api.listTemplates.mockResolvedValue([
    { key: "newsletter", channel: "email", subject: "News", body_en: "Hello {{business_name}}", body_sw: null, transactional: false, version: 1, used_30d: 1, disabled_at: null, system: false },
    { key: "old_promo", channel: "sms", subject: null, body_en: "Old promo", body_sw: null, transactional: false, version: 2, used_30d: 0, disabled_at: "2026-10-30T08:00:00Z", system: false },
    { key: "welcome", channel: "email", subject: "Welcome", body_en: "Welcome", body_sw: null, transactional: false, version: 1, used_30d: 9, disabled_at: null, system: true },
  ]);
  api.listMessageLog.mockResolvedValue({ total: 2, rows: [
    { id: "m1", created_at: "2026-10-31T08:00:00Z", channel: "email", status: "sent", subject: "Application received", business_id: null, business_name: null, application_id: "a1", application_name: "Kamau Cuts", to_address: "kamau@cuts.test", attempts: 1, scheduled_at: "2026-10-31T08:00:00Z" },
    { id: "m2", created_at: "2026-10-31T07:00:00Z", channel: "sms", status: "cancelled", subject: "Weekend offer", business_id: "b2", business_name: "Fade Kings", to_address: "+254722000111", attempts: 0, scheduled_at: "2026-11-01T09:30:00Z" },
  ] });
  api.getMessageSummary.mockResolvedValue({ days: 7, by_status: { sent: 1 }, cost_kes: 0 });
  api.getMessageDetail.mockResolvedValue({ id: "m1", subject: "Application received", body: "Thanks for applying. We review within two working days.", channel: "email", status: "sent", business_id: null, application_name: "Kamau Cuts", applicant_name: "Wanjiku Kamau", to_address: "kamau@cuts.test", attempts: 1, scheduled_at: "2026-10-31T10:00:00Z", created_at: "2026-10-31T09:30:00Z", sent_at: null, transactional: true, template_key: "application.received", created_by_email: "admin@epicmkt.test" });
  api.listPendingBroadcasts.mockResolvedValue([batch]);
  api.cancelBroadcast.mockResolvedValue({ cancelled: 6, sent: 2, failed: 0, inFlight: 0, total: 8 });
  api.getBusinessFilterOptions.mockResolvedValue({ categories: ["Barber", "Bakery"], counties: [{ name: "Kisumu", towns: ["Kisumu", "Maseno"] }, { name: "Nairobi", towns: ["Westlands"] }], plans: [], agents: [] });
  api.sendBroadcast.mockResolvedValue(preview);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Cancel a waiting broadcast", () => {
  it("lists what is waiting with the send time in Nairobi", async () => {
    renderPage("/?tab=log");
    const row = await screen.findByTestId("pending-broadcast");
    expect(within(row).getByText("Weekend offer")).toBeInTheDocument();
    expect(within(row).getByText("6 of 8")).toBeInTheDocument();
    expect(within(row).getByText(/12:30/)).toBeInTheDocument();
  });

  it("asks first, needs a reason, then reports cancelled against already sent", async () => {
    renderPage("/?tab=log");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel broadcast Weekend offer" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this broadcast?" });
    expect(api.cancelBroadcast).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Cancel broadcast" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Wrong audience" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel broadcast" }));
    await waitFor(() => expect(api.cancelBroadcast).toHaveBeenCalledWith({ batchId: "bt1", reason: "Wrong audience" }));
    expect(await screen.findByText("6 cancelled, 2 already sent.")).toBeInTheDocument();
  });

  it("shows a refusal inside the dialog", async () => {
    const { ApiError } = await import("../api/errors.js");
    api.cancelBroadcast.mockRejectedValue(new ApiError("broadcast_not_found", "That broadcast no longer exists. Refresh the page."));
    renderPage("/?tab=log");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel broadcast Weekend offer" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Wrong audience" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel broadcast" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("no longer exists");
  });

  it("is not offered to a role that cannot message sellers", async () => {
    mockRole = "finance";
    renderPage("/?tab=log");
    expect(await screen.findByRole("button", { name: "Cancel broadcast Weekend offer" })).toBeDisabled();
  });

  it("shows nothing when no broadcast is waiting", async () => {
    api.listPendingBroadcasts.mockResolvedValue([]);
    renderPage("/?tab=log");
    await screen.findByText("Application received");
    expect(screen.queryByTestId("pending-broadcast")).toBeNull();
  });
});

describe("Message log", () => {
  it("shows the applicant's name instead of Applicant, and cancelled messages", async () => {
    renderPage("/?tab=log");
    expect(await screen.findByText("Kamau Cuts")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cancelled" })).toBeInTheDocument();
  });

  it("opens a message to read the whole body and its details", async () => {
    renderPage("/?tab=log");
    fireEvent.click(await screen.findByRole("button", { name: "View message Application received" }));
    const dialog = await screen.findByRole("dialog", { name: "Application received" });
    expect(await within(dialog).findByTestId("message-body")).toHaveTextContent("We review within two working days.");
    expect(within(dialog).getByText("Wanjiku Kamau")).toBeInTheDocument();
    expect(within(dialog).getByText("application.received")).toBeInTheDocument();
    expect(within(dialog).getByText("31 Oct 2026, 12:30 pm")).toBeInTheDocument();
    expect(within(dialog).getByText("31 Oct 2026, 1:00 pm")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Category and town pickers", () => {
  const choose = async (label, value) => {
    fireEvent.change(await screen.findByLabelText("Send to"), { target: { value } });
    return screen.findByLabelText(label);
  };

  it("offers the categories that exist and sends the one chosen", async () => {
    renderPage("/");
    const picker = await choose("Category", "category");
    await waitFor(() => expect(within(picker).getByRole("option", { name: "Barber" })).toBeInTheDocument());
    expect(screen.queryByRole("textbox", { name: /Category/ })).toBeNull();
    fireEvent.change(picker, { target: { value: "Barber" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello all" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(api.sendBroadcast).toHaveBeenCalledWith(expect.objectContaining({ target: { segment: "category:Barber" }, preview: true })));
  });

  it("groups towns by county and asks for a choice before it will preview", async () => {
    renderPage("/");
    const picker = await choose("Town", "town");
    await waitFor(() => expect(within(picker).getByRole("option", { name: "Maseno" })).toBeInTheDocument());
    expect(within(picker).getAllByRole("group").map((g) => g.getAttribute("label"))).toEqual(["Kisumu", "Nairobi"]);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hello all" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("Choose who should receive this.")).toBeInTheDocument();
    expect(api.sendBroadcast).not.toHaveBeenCalled();
  });

  it("says so when the lists cannot be loaded", async () => {
    api.getBusinessFilterOptions.mockRejectedValue(new Error("down"));
    renderPage("/");
    const picker = await choose("Category", "category");
    await waitFor(() => expect(picker).toBeDisabled());
    expect(within(picker).getByRole("option", { name: "Could not load categories" })).toBeInTheDocument();
  });
});

describe("Templates: disable, enable, delete", () => {
  it("hides disabled templates from the composer", async () => {
    renderPage("/");
    const select = await screen.findByLabelText("Template");
    await waitFor(() => expect(within(select).getByRole("option", { name: /newsletter/ })).toBeInTheDocument());
    expect(within(select).queryByRole("option", { name: /old_promo/ })).toBeNull();
  });

  it("disables and enables from the list", async () => {
    renderPage("/?tab=templates");
    fireEvent.click(await screen.findByRole("button", { name: "Disable template newsletter" }));
    await waitFor(() => expect(api.setTemplateEnabled).toHaveBeenCalledWith({ key: "newsletter", enabled: false }));
    fireEvent.click(screen.getByRole("button", { name: "Enable template old_promo" }));
    await waitFor(() => expect(api.setTemplateEnabled).toHaveBeenCalledWith({ key: "old_promo", enabled: true }));
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("will not offer delete for a template the system uses, and says to disable it instead", async () => {
    renderPage("/?tab=templates");
    const button = await screen.findByRole("button", { name: "Delete template welcome" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/Disable it instead/));
  });

  it("deletes an ordinary template after a confirmation", async () => {
    renderPage("/?tab=templates");
    fireEvent.click(await screen.findByRole("button", { name: "Delete template old_promo" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete old_promo?" });
    expect(api.deleteTemplate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "No longer used" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete template" }));
    await waitFor(() => expect(api.deleteTemplate).toHaveBeenCalledWith("old_promo"));
  });

  it("is read only for a role that cannot edit templates", async () => {
    mockRole = "support";
    renderPage("/?tab=templates");
    expect(await screen.findByRole("button", { name: "Disable template newsletter" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete template old_promo" })).toBeDisabled();
  });
});
