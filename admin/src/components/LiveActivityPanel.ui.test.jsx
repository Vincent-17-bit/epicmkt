import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Real permissions table, with per-action overrides so a role that can view but not manage can be tested.
let mockRole = "reviewer";
let mockOverrides = {};
vi.mock("../hooks/usePermissions.js", async () => {
  const { explain, roleCan } = await import("../auth/permissions.js");
  return {
    usePermissions: () => ({
      role: mockRole,
      can: (action) => mockOverrides[action] ?? roleCan(mockRole, action),
      why: (action) => (mockOverrides[action] === false ? "Only Owners and Reviewers can do that." : explain(mockRole, action)),
    }),
  };
});

const row = (id, text, extra = {}) => ({ id, text, to: null, at: "2026-10-30T09:00:00Z", ...extra });
const FEED = [
  row("n:1", "New application from Umoja Market", { to: "/admin/applications", at: "2026-10-30T09:04:00Z" }),
  row("n:2", "Payment confirmed for Shop A", { to: "/admin/payments", at: "2026-10-30T09:03:00Z" }),
  row("a:3", "reviewer@test paused Shop B", { at: "2026-10-30T09:02:00Z" }),
];

let server;
const api = {
  getAdminActivity: vi.fn(async () => server.map((r) => ({ ...r }))),
  deleteAdminActivity: vi.fn(async ({ ids }) => {
    const gone = server.filter((r) => ids.includes(r.id));
    server = server.filter((r) => !ids.includes(r.id));
    return { deleted: gone.filter((r) => r.id.startsWith("n:")).length, dismissed: gone.filter((r) => r.id.startsWith("a:")).length, skipped: 0 };
  }),
};
vi.mock("../api/index.js", () => ({ api, default: api }));

const { default: LiveActivityPanel } = await import("./LiveActivityPanel.jsx");
const { ToastProvider } = await import("./Toast.jsx");

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/admin"]}>
          <LiveActivityPanel />
          <Where />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

const wait = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const deleteButton = (text) => screen.getByRole("button", { name: `Delete: ${text}` });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  server = FEED.map((r) => ({ ...r }));
  mockRole = "reviewer";
  mockOverrides = {};
  api.getAdminActivity.mockClear();
  api.deleteAdminActivity.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Live activity: rows and permissions", () => {
  it("gives every row a labelled, touch-sized delete button and keeps the row link", async () => {
    mount();
    expect(await screen.findByRole("link", { name: "New application from Umoja Market" })).toHaveAttribute("href", "/admin/applications");
    for (const item of FEED) {
      const button = deleteButton(item.text);
      expect(button).toHaveClass("activity-list__delete"); // 44px minimum, hover/focus/touch rules live in styles/components/live-activity.css
    }
    expect(screen.getAllByRole("button", { name: /^Delete: / })).toHaveLength(3);
  });

  it("clicking delete does not follow the row's link, clicking the text does", async () => {
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(deleteButton("Payment confirmed for Shop A"));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin");
    fireEvent.click(screen.getByRole("link", { name: "New application from Umoja Market" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/admin/applications");
  });

  it("shows no delete buttons to a role that cannot manage the feed, and disables Clear all with the reason", async () => {
    mockOverrides = { "activity.manage": false };
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    expect(screen.queryByRole("button", { name: /^Delete: / })).not.toBeInTheDocument();
    const clear = screen.getByRole("button", { name: "Clear all" });
    expect(clear).toBeDisabled();
    expect(clear).toHaveAttribute("title", "Only Owners and Reviewers can do that.");
  });

  it("a role that cannot even view the feed gets the explanation and no controls", async () => {
    mockRole = "support";
    mount();
    expect(await screen.findByText(/Only Owners and Reviewers can see the live activity feed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all" })).not.toBeInTheDocument();
    expect(api.getAdminActivity).not.toHaveBeenCalled();
  });
});

describe("Live activity: single delete with Undo", () => {
  it("removes the row at once, then deletes on the server after 5 seconds", async () => {
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(deleteButton("Payment confirmed for Shop A"));

    expect(screen.queryByText("Payment confirmed for Shop A")).not.toBeInTheDocument();
    expect(screen.getByText("Notification deleted.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(api.deleteAdminActivity).not.toHaveBeenCalled();

    await wait(4900);
    expect(api.deleteAdminActivity).not.toHaveBeenCalled();
    await wait(200);
    expect(api.deleteAdminActivity).toHaveBeenCalledTimes(1);
    expect(api.deleteAdminActivity).toHaveBeenCalledWith({ ids: ["n:2"] });
    await waitFor(() => expect(api.getAdminActivity).toHaveBeenCalledTimes(2)); // refetched to fill the gap
    expect(screen.queryByText("Payment confirmed for Shop A")).not.toBeInTheDocument();
    expect(screen.getByText("New application from Umoja Market")).toBeInTheDocument();
  });

  it("Undo brings the row back and nothing is ever sent to the server", async () => {
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(deleteButton("Payment confirmed for Shop A"));
    expect(screen.queryByText("Payment confirmed for Shop A")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("Payment confirmed for Shop A")).toBeInTheDocument();
    // back in its place: second of three
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[1]).toContain("Payment confirmed for Shop A");

    await wait(6000);
    expect(api.deleteAdminActivity).not.toHaveBeenCalled();
    expect(server).toHaveLength(3);
  });

  it("an audit row says it is only hidden from this feed", async () => {
    mount();
    await screen.findByText("reviewer@test paused Shop B");
    fireEvent.click(deleteButton("reviewer@test paused Shop B"));
    expect(screen.getByText("Hidden from your feed. The audit log keeps it.")).toBeInTheDocument();
    await wait(5100);
    expect(api.deleteAdminActivity).toHaveBeenCalledWith({ ids: ["a:3"] });
  });

  it("a refetch during the Undo window does not bring the row back", async () => {
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(deleteButton("Payment confirmed for Shop A"));
    await wait(60_000 - 100); // the 60 second poll is due, but the delete is only 5 s long: it has been sent by now
    expect(api.deleteAdminActivity).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Payment confirmed for Shop A")).not.toBeInTheDocument();
  });

  it("when the server refuses, the row comes back and an error toast says why", async () => {
    api.deleteAdminActivity.mockRejectedValueOnce(Object.assign(new Error("forbidden"), { code: "forbidden" }));
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(deleteButton("Payment confirmed for Shop A"));
    expect(screen.queryByText("Payment confirmed for Shop A")).not.toBeInTheDocument();

    await wait(5100);
    expect(await screen.findByText("Payment confirmed for Shop A")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not delete that item.");
    expect(server).toHaveLength(3); // nothing was removed
  });
});

describe("Live activity: Clear all", () => {
  it("is disabled when there is nothing to clear", async () => {
    server = [];
    mount();
    expect(await screen.findByText(/Nothing has happened yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("asks first, explains what happens to each kind of row, and needs a reason", async () => {
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("2 notifications will be deleted for everyone and cannot be brought back.");
    expect(dialog).toHaveTextContent("1 audit entry will be hidden from your feed only.");
    const confirm = within(dialog).getByRole("button", { name: "Clear all" });
    expect(confirm).toBeDisabled();
    expect(api.deleteAdminActivity).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "end of shift" } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(api.deleteAdminActivity).toHaveBeenCalledWith({ ids: ["n:1", "n:2", "a:3"], reason: "end of shift" }));
    expect(await screen.findByText(/You have cleared the feed/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing has happened yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Cleared 3 items (2 deleted, 1 hidden from your feed).")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("Cancel changes nothing", async () => {
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.deleteAdminActivity).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("keeps the dialog and every row when the server refuses", async () => {
    api.deleteAdminActivity.mockRejectedValueOnce(Object.assign(new Error("forbidden"), { code: "forbidden" }));
    mount();
    await screen.findByText("Payment confirmed for Shop A");
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "end of shift" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear all" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Payment confirmed for Shop A")).toBeInTheDocument();
    expect(server).toHaveLength(3);
  });
});

describe("Live activity: other states keep working", () => {
  it("shows a loading line, then the empty message when nothing has happened", async () => {
    server = [];
    mount();
    expect(screen.getByText("Loading activity")).toBeInTheDocument();
    expect(await screen.findByText(/Nothing has happened yet/)).toBeInTheDocument();
  });

  it("shows the error banner with a working Try again", async () => {
    api.getAdminActivity.mockRejectedValueOnce(new Error("boom"));
    mount();
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Could not load the activity.");
    fireEvent.click(within(banner).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Payment confirmed for Shop A")).toBeInTheDocument();
  });

  it("the empty message changes after the last row is deleted one by one", async () => {
    server = [FEED[0]];
    mount();
    await screen.findByText("New application from Umoja Market");
    fireEvent.click(deleteButton("New application from Umoja Market"));
    await wait(5100);
    expect(await screen.findByText(/You have cleared the feed/)).toBeInTheDocument();
  });
});
