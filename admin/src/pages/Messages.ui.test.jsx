import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "support";
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const at = (m) => new Date(Date.now() - m * 60000).toISOString();
const msg = (id, businessId, businessName, sellerId, extra) => ({
  id, businessId, businessName, sellerId, sender: "admin", kind: "general", subject: "Hello", body: "Hi there", needsReply: false,
  threadId: id, parentId: null, createdAt: at(30), readAt: null, deliveredAt: null, adminDeliveredAt: null, adminReadAt: null, attachments: [], ...extra,
});

const api = {
  listMessages: vi.fn(),
  listResolvedConversations: vi.fn(),
  setConversationResolved: vi.fn(async () => ({ resolved: true, changed: true })),
  listBusinesses: vi.fn(),
  sendMessage: vi.fn(async () => ({ sent: 1, skipped: 0, ids: ["x"] })),
  markMessagesRead: vi.fn(async () => 0),
  ackMessagesDelivered: vi.fn(async () => 0),
  deleteMessage: vi.fn(),
  deleteConversation: vi.fn(),
  openMessageFile: vi.fn(),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: MessagesPage } = await import("./MessagesPage.jsx");
const { ToastProvider } = await import("../components/Toast.jsx");

function renderPage(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ToastProvider><MessagesPage /></ToastProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

const rows = () => screen.queryAllByTestId("conversation-row").map((r) => r.textContent);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mockRole = "support";
  api.listMessages.mockResolvedValue([
    msg("m1", "b1", "Lakeside Provisions", "ES100001", { sender: "seller", subject: "Prices", body: "Unga is now 180", adminReadAt: null, createdAt: at(5) }),
    msg("m2", "b2", "Fade Kings", "ES100002", { subject: "Contact", body: "Send your number", needsReply: true, createdAt: at(20) }),
    msg("m3", "b3", "Rafiki Tools", "ES100003", { subject: "Done", body: "All sorted", createdAt: at(60) }),
  ]);
  api.listResolvedConversations.mockResolvedValue(["b3"]);
  api.listBusinesses.mockResolvedValue({ rows: [
    { id: "b3", name: "Rafiki Tools", sellerId: "ES100003", town: "Kisumu" },
    { id: "b9", name: "Mama Mboga", sellerId: "ES100009", town: "Maseno" },
  ], total: 2 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Messages: search and filters", () => {
  it("lists every conversation and marks resolved ones", async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(within(screen.getAllByTestId("conversation-row")[2]).getByText("Resolved")).toBeInTheDocument();
  });

  it("filters to unread, waiting and resolved", async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole("tab", { name: /Unread/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatch(/Lakeside/);
    fireEvent.click(screen.getByRole("tab", { name: /Waiting for reply/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatch(/Fade Kings/);
    fireEvent.click(screen.getByRole("tab", { name: /Resolved/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatch(/Rafiki/);
  });

  it("searches by business name, seller ID and message text", async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    const box = screen.getByLabelText("Search conversations");
    fireEvent.change(box, { target: { value: "es100002" } });
    expect(rows()).toHaveLength(1);
    fireEvent.change(box, { target: { value: "unga" } });
    expect(rows()[0]).toMatch(/Lakeside/);
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByTestId("no-match")).toBeInTheDocument();
  });
});

describe("Messages: resolved state", () => {
  it("marks an open conversation resolved", async () => {
    renderPage("/?business=b2");
    const button = await screen.findByRole("button", { name: "Mark resolved" });
    fireEvent.click(button);
    await waitFor(() => expect(api.setConversationResolved).toHaveBeenCalledWith({ businessId: "b2", resolved: true }));
  });

  it("offers Reopen on a resolved conversation", async () => {
    renderPage("/?business=b3");
    fireEvent.click(await screen.findByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(api.setConversationResolved).toHaveBeenCalledWith({ businessId: "b3", resolved: false }));
  });

  it("hides resolve and new conversation from a role that cannot message sellers", async () => {
    mockRole = "finance";
    renderPage("/?business=b2");
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Mark resolved" })).toBeNull();
    expect(screen.queryByRole("button", { name: /New/ })).toBeNull();
  });
});

describe("Messages: new conversation", () => {
  it("picks a business with no conversation and sends the first message to it", async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: /New/ }));
    const dialog = await screen.findByRole("dialog", { name: "New conversation" });
    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "mama" } });
    await waitFor(() => expect(api.listBusinesses).toHaveBeenCalledWith(expect.objectContaining({ search: "mama" })));
    fireEvent.click(await within(dialog).findByText("Mama Mboga"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: "Mama Mboga" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark resolved" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Welcome aboard" } });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ businessId: "b9", body: "Welcome aboard" })));
  });

  it("opens the existing conversation when the business already has one", async () => {
    renderPage();
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: /New/ }));
    const dialog = await screen.findByRole("dialog", { name: "New conversation" });
    fireEvent.click(await within(dialog).findByText("Rafiki Tools"));
    expect(await screen.findByRole("button", { name: "Reopen" })).toBeInTheDocument();
  });
});
