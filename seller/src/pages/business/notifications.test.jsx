import { describe, it, expect } from "vitest";
import { screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { M, signedInApp } from "../../test/utils.jsx";

const bell = () => screen.queryByTestId("bell-count");

describe("notifications", () => {
  it("lists messages, shows the unread count in the bell and in the page", async () => {
    await signedInApp("/business/notifications");
    const items = await screen.findAllByTestId("notification");
    expect(items).toHaveLength(3);
    await waitFor(() => expect(bell()).toHaveTextContent("2"));
    expect(screen.getByRole("link", { name: "Notifications, 2 unread" })).toBeInTheDocument();
    expect(screen.getByTestId("unread-summary")).toHaveTextContent("2 unread");
    expect(items.map((i) => i.dataset.unread)).toEqual(["true", "true", "false"]);
  });

  it("marks one message read, then all", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/notifications");
    await screen.findAllByTestId("notification");
    await user.click(screen.getByRole("button", { name: /Mark "Wrong price reported" as read/ }));
    await waitFor(() => expect(bell()).toHaveTextContent("1"));
    await waitFor(() => expect(M.state.messages.find((m) => m.id === "m2").readAt).toBeTruthy());
    expect(M.state.messages.find((m) => m.id === "m1").readAt).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(bell()).toBeNull());
    expect(screen.getByTestId("unread-summary")).toHaveTextContent("all caught up");
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeDisabled();
    await waitFor(() => expect(M.state.messages.every((m) => m.readAt)).toBe(true));
  });

  it("opening a notification marks it read and updates the bell by itself", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/notifications");
    const items = await screen.findAllByTestId("notification");
    await waitFor(() => expect(bell()).toHaveTextContent("2"));
    await user.click(items.find((i) => i.textContent.includes("Wrong price reported")));
    await waitFor(() => expect(bell()).toHaveTextContent("1"));
    await waitFor(() => expect(M.state.messages.find((m) => m.id === "m2").readAt).toBeTruthy());
    expect(screen.getByTestId("unread-summary")).toHaveTextContent("1 unread");
  });

  it("filters by type", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/notifications");
    await screen.findAllByTestId("notification");
    await user.click(screen.getByRole("button", { name: "Customer reports" }));
    await waitFor(() => expect(screen.getAllByTestId("notification")).toHaveLength(1));
    expect(screen.getByTestId("notification").dataset.kind).toBe("report");
    expect(screen.getByRole("button", { name: "Customer reports" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Billing" }));
    await waitFor(() => expect(screen.getByTestId("notification").dataset.kind).toBe("reminder"));
    await user.click(screen.getByRole("button", { name: "Strikes" }));
    expect(await screen.findByTestId("empty")).toBeInTheDocument();
  });

  it("a customer report shows what was reported and never who reported it", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/notifications");
    await user.click(await screen.findByRole("button", { name: "Customer reports" }));
    const n = await screen.findByTestId("notification");
    expect(n).toHaveTextContent("Wrong price reported");
    expect(n).toHaveTextContent("Fade cut");
    expect(n.textContent).not.toMatch(/reporter|hash|phone|@/i);
  });

  it("new messages arrive by themselves: list and bell update without a reload", async () => {
    await signedInApp("/business/notifications");
    await screen.findAllByTestId("notification");
    act(() => { M.post("strike", "Strike 1 of 3", "A listing rule was broken.", {}); });
    expect(await screen.findByText("Strike 1 of 3")).toBeInTheDocument();
    await waitFor(() => expect(bell()).toHaveTextContent("3"));
    expect(screen.getAllByTestId("notification")).toHaveLength(4);
  });

  it("a new message respects the active filter", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/notifications");
    await user.click(await screen.findByRole("button", { name: "Strikes" }));
    await screen.findByTestId("empty");
    act(() => { M.post("reminder", "Expires in 3 days", "Renew soon", {}); });
    await waitFor(() => expect(bell()).toHaveTextContent("3"));
    expect(screen.getByTestId("empty")).toBeInTheDocument();
    act(() => { M.post("strike", "Strike 1", "x", {}); });
    expect(await screen.findByText("Strike 1")).toBeInTheDocument();
  });

  it("every kind the system writes has a filter", async () => {
    const { FILTERS } = await import("./Notifications.jsx");
    const covered = new Set(FILTERS.flatMap((f) => f.kinds ?? []));
    for (const k of ["approval", "reminder", "grace", "expiry", "change", "removal", "strike", "report", "payment", "question"]) expect(covered.has(k), k).toBe(true);
  });

  it("works for suspended and unlisted sellers", async () => {
    for (const status of ["suspended", "paused", "expired"]) {
      const { unmount } = await signedInApp("/business/notifications", () => { M.state.business.status = status; });
      expect(await screen.findAllByTestId("notification")).toHaveLength(3);
      unmount();
    }
  });

  it("the bell is on every page", async () => {
    await signedInApp("/business/questions");
    await waitFor(() => expect(bell()).toHaveTextContent("2"));
    expect(within(screen.getByRole("navigation", { name: "Business" })).getByRole("link", { name: /Notifications/ })).toBeInTheDocument();
  });
});
