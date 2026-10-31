import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../hooks/usePermissions.js", () => ({ usePermissions: () => ({ can: () => true, why: () => "" }) }));

const api = {
  listConversations: vi.fn(),
  listResolvedConversations: vi.fn(async () => []),
  setConversationResolved: vi.fn(),
  listBusinesses: vi.fn(async () => ({ rows: [], total: 0 })),
  listMessages: vi.fn(),
  markMessagesRead: vi.fn(async () => 0),
  ackMessagesDelivered: vi.fn(async () => 0),
  sendMessage: vi.fn(),
  deleteMessage: vi.fn(),
  deleteConversation: vi.fn(),
  openMessageFile: vi.fn(),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: MessagesPage } = await import("./MessagesPage.jsx");
const { ToastProvider } = await import("../components/Toast.jsx");

const row = (n, extra = {}) => ({ id: `b${n}`, name: `Shop ${n}`, sellerId: `ES${n}`, lastAt: new Date(Date.UTC(2026, 9, 30, 12, 0) - n * 60_000).toISOString(), lastSubject: `Subject ${n}`, messageCount: 1, unread: 0, waiting: false, ...extra });
const message = (businessId, extra = {}) => ({
  id: `m-${businessId}`, businessId, businessName: `Shop ${businessId.slice(1)}`, sellerId: `ES${businessId.slice(1)}`, sender: "seller", kind: "general", subject: "Hello", body: "Hi", needsReply: false,
  threadId: `m-${businessId}`, parentId: null, createdAt: "2026-10-30T10:00:00Z", readAt: null, deliveredAt: null, adminDeliveredAt: null, adminReadAt: "2026-10-30T10:05:00Z", attachments: [], ...extra,
});

function renderPage(path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><ToastProvider><MessagesPage /></ToastProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn(); // jsdom does not implement it
  // 31 conversations: the first page holds 30, so the oldest one (Shop 31, with an unread message) is on page two.
  api.listConversations.mockImplementation(async ({ page, pageSize }) => {
    const all = Array.from({ length: 31 }, (_, i) => row(i + 1, i === 30 ? { unread: 2 } : {}));
    return { total: 31, unreadTotal: 2, counts: { all: 31, unread: 1, waiting: 0, resolved: 0 }, rows: all.slice(page * pageSize, (page + 1) * pageSize) };
  });
  api.listMessages.mockImplementation(async ({ businessId }) => [message(businessId)]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Messages inbox", () => {
  it("lists conversations a page at a time and loads older ones on request, with their unread count", async () => {
    renderPage();
    expect(await screen.findAllByTestId("conversation-row")).toHaveLength(30);
    expect(api.listConversations).toHaveBeenCalledWith({ page: 0, pageSize: 30, filter: "all", search: "" });
    expect(screen.queryByText("Shop 31")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Load older conversations \(30 of 31\)/ }));
    expect(await screen.findByText("Shop 31")).toBeInTheDocument();
    expect(api.listConversations).toHaveBeenCalledWith({ page: 1, pageSize: 30, filter: "all", search: "" });
    const old = screen.getByText("Shop 31").closest("button");
    expect(within(old).getByTitle("2 unread")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load older conversations/ })).not.toBeInTheDocument();
  });

  it("sends the tab and the search to the server, so they cover every conversation and not just the ones on screen", async () => {
    renderPage();
    await screen.findAllByTestId("conversation-row");
    fireEvent.click(screen.getByRole("tab", { name: /Unread/ }));
    await waitFor(() => expect(api.listConversations).toHaveBeenCalledWith({ page: 0, pageSize: 30, filter: "unread", search: "" }));
    fireEvent.change(screen.getByLabelText("Search conversations"), { target: { value: "  unga  " } });
    await waitFor(() => expect(api.listConversations).toHaveBeenCalledWith({ page: 0, pageSize: 30, filter: "unread", search: "unga" }));
    expect(api.listMessages).not.toHaveBeenCalled();
  });

  it("shows each tab's count from the server, for all conversations", async () => {
    renderPage();
    await screen.findAllByTestId("conversation-row");
    expect(screen.getByRole("tab", { name: /All/ })).toHaveTextContent("31");
    expect(screen.getByRole("tab", { name: /Unread/ })).toHaveTextContent("1");
  });

  it("never loads every business's messages at once: only the open conversation's", async () => {
    renderPage();
    expect(api.listMessages).not.toHaveBeenCalled();
    fireEvent.click((await screen.findAllByTestId("conversation-row"))[2]);
    await waitFor(() => expect(api.listMessages).toHaveBeenCalledWith({ businessId: "b3" }));
    expect(api.listMessages).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("thread")).toBeInTheDocument();
  });

  it("opens a conversation from a link even when it is not on the first page, and marks its unread messages read", async () => {
    api.listMessages.mockImplementation(async ({ businessId }) => [message(businessId, { adminReadAt: null })]);
    renderPage("/?business=b31");
    expect(await screen.findByTestId("thread")).toBeInTheDocument();
    await waitFor(() => expect(api.markMessagesRead).toHaveBeenCalledWith({ businessId: "b31" }));
    expect(api.listMessages).toHaveBeenCalledWith({ businessId: "b31" });
  });

  it("says so when the list or a conversation cannot be loaded", async () => {
    api.listMessages.mockRejectedValue(new Error("boom"));
    renderPage("/?business=b1");
    expect(await screen.findByText(/Could not load this conversation/)).toBeInTheDocument();
  });
});
