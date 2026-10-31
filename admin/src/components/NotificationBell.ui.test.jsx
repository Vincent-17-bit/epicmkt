import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const msg = (id, who, extra = {}) => ({ id, businessId: `b-${who.replace(" ", "")}`, businessName: who, sender: "seller", subject: "Hello", body: `Message ${id}`, createdAt: `2026-10-30T09:0${id}:00Z`, adminReadAt: null, ...extra });

let messages;
let notes;
const unreadMessages = () => messages.filter((m) => m.sender === "seller" && !m.adminReadAt).length;
const api = {
  getUnreadNotificationCount: vi.fn(async () => notes.filter((n) => !n.read).length),
  getNotifications: vi.fn(async () => notes.filter((n) => !n.read).map((n) => ({ ...n }))),
  markNotificationsRead: vi.fn(async (ids) => { notes = notes.map((n) => (!Array.isArray(ids) || ids.includes(n.id) ? { ...n, read: true } : n)); return { ok: true }; }),
  getUnreadMessages: vi.fn(async () => unreadMessages()),
  listMessages: vi.fn(async () => messages.map((m) => ({ ...m }))),
  markMessagesRead: vi.fn(async ({ ids }) => { messages = messages.map((m) => (ids.includes(m.id) ? { ...m, adminReadAt: "2026-10-30T10:00:00Z" } : m)); return ids.length; }),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: NotificationBell } = await import("./NotificationBell.jsx");

const Where = () => { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output>; };
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={["/admin"]}><NotificationBell /><Where /></MemoryRouter>
  </QueryClientProvider>,
);
const openBell = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^Notifications/ }));
  return screen.findByRole("region", { name: "Notifications" });
};

beforeEach(() => {
  messages = [msg("1", "Shop A"), msg("2", "Shop B"), msg("3", "Shop A", { sender: "admin" })];
  notes = [{ id: "n1", at: "2026-10-30T09:05:00Z", kind: "application_submitted", business_name: "Umoja", data: {}, read: false }];
  Object.values(api).forEach((f) => f.mockClear());
});
afterEach(cleanup);

describe("Notification bell with messages", () => {
  it("counts unread messages and activity together in the button name", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Notifications, 3 unread" })).toBeInTheDocument();
  });

  it("lists only unread seller messages, newest first, under a Messages heading", async () => {
    mount();
    const panel = await openBell();
    const section = await within(panel).findByRole("region", { name: /^Messages/ });
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Shop B");
    expect(rows[1]).toHaveTextContent("Shop A");
  });

  it("clicking a message opens it in Messages on that business and marks it read", async () => {
    mount();
    const panel = await openBell();
    fireEvent.click(await within(panel).findByRole("button", { name: /^Shop B/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/messages?business=b-ShopB&message=2");
    await waitFor(() => expect(api.markMessagesRead).toHaveBeenCalledWith({ ids: ["2"] }));
    expect(screen.queryByRole("region", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("'Mark as read' clears one message from the bell without leaving the page", async () => {
    mount();
    const panel = await openBell();
    fireEvent.click(await within(panel).findByRole("button", { name: "Mark message from Shop A as read" }));
    await waitFor(() => expect(api.markMessagesRead).toHaveBeenCalledWith({ ids: ["1"] }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin");
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument());
  });

  it("'Mark all read' marks both messages and activity", async () => {
    mount();
    const panel = await openBell();
    await within(panel).findByRole("region", { name: /^Messages/ });
    fireEvent.click(within(panel).getByRole("button", { name: /Mark all read/ }));
    await waitFor(() => expect(api.markMessagesRead).toHaveBeenCalledWith({ ids: ["1", "2"] }));
    expect(api.markNotificationsRead).toHaveBeenCalledWith(undefined);
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument());
  });
});
