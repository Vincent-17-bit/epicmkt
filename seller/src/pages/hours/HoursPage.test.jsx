import { describe, test, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import * as mock from "../../api/mock.js";
import * as api from "../../api/index.js";
import HoursPage from "./HoursPage.jsx";
import { KEYS } from "./queries.js";
import { Toaster } from "../../components/ui/index.js";
import { useToastStore } from "../../stores/toast.js";

let qc;

async function mount() {
  mock.resetMock();
  useToastStore.getState().clear();
  await mock.login("ES100001", "Demo-Passw0rd");
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } } });
  await qc.fetchQuery({ queryKey: KEYS.hours, queryFn: api.getHours });
  await qc.fetchQuery({ queryKey: KEYS.settings, queryFn: api.getHoursSettings });
  const router = createMemoryRouter(
    [
      { path: "/business/hours", element: <HoursPage /> },
      { path: "/elsewhere", element: <p>Elsewhere page</p> }
    ],
    { initialEntries: ["/business/hours"] }
  );
  const view = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
  return { router, view };
}

const day = (key) => document.querySelector(`[data-day="${key}"]`);
const timeInputs = (key) => within(day(key)).getAllByLabelText(/^(Opens|Closes)$/);
const setTime = (el, value) => fireEvent.change(el, { target: { value } });

describe("hours page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("renders every section in order", async () => {
    await mount();
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Status now", "Weekly hours", "Temporary closure and open late", "Partial closures", "Date exceptions", "Customer preview"]);
    expect(screen.getByTestId("status-label")).toBeInTheDocument();
  });

  test("saving shows a toast with Undo that restores the previous hours using the current version", async () => {
    const user = userEvent.setup();
    await mount();
    setTime(timeInputs("mon")[0], "09:00");
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    await user.click(within(bar).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Hours saved")).toBeInTheDocument();
    expect(qc.getQueryData(KEYS.hours).hours_version).toBe(2);
    expect(qc.getQueryData(KEYS.hours).hours.mon.intervals[0].start).toBe("09:00");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(qc.getQueryData(KEYS.hours).hours_version).toBe(3));
    expect(qc.getQueryData(KEYS.hours).hours.mon.intervals[0].start).toBe("08:00");
    await waitFor(() => expect(timeInputs("mon")[0]).toHaveValue("08:00"));
  });

  test("invalid hours block saving and show inline errors", async () => {
    await mount();
    setTime(timeInputs("tue")[0], "18:00");
    setTime(timeInputs("tue")[1], "18:00");
    expect(await within(day("tue")).findByText(/cannot be the same/)).toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(within(bar).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(bar).getByText("Fix the highlighted days to save")).toBeInTheDocument();
  });

  test("end before start is labelled as ending the next day", async () => {
    await mount();
    setTime(timeInputs("fri")[0], "20:00");
    setTime(timeInputs("fri")[1], "02:00");
    expect(await within(day("fri")).findByText("Ends next day")).toBeInTheDocument();
    expect(within(day("fri")).getByText(/8:00 PM to 2:00 AM \(next day\)/)).toBeInTheDocument();
  });

  test("a change made on another device shows the conflict message and Reload discards the draft", async () => {
    const user = userEvent.setup();
    await mount();
    setTime(timeInputs("tue")[0], "07:30");
    await screen.findByRole("region", { name: "Unsaved changes" });
    act(() => mock.simulateRemoteHoursChange());
    await act(async () => {
      await qc.invalidateQueries({ queryKey: KEYS.hours });
    });
    const alert = await screen.findByTestId("conflict");
    expect(alert).toHaveTextContent("These hours were changed on another device. Reload to continue");
    expect(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(within(alert).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.queryByTestId("conflict")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
    expect(timeInputs("mon")[0]).toHaveValue("07:00");
    expect(timeInputs("tue")[0]).toHaveValue("08:00");
  });

  test("a server conflict on save is detected even before a refetch", async () => {
    const user = userEvent.setup();
    await mount();
    setTime(timeInputs("tue")[0], "07:30");
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    mock.simulateRemoteHoursChange();
    await user.click(within(bar).getByRole("button", { name: "Save" }));
    expect(await screen.findByTestId("conflict")).toBeInTheDocument();
    expect(qc.getQueryData(KEYS.hours).hours.tue.intervals[0].start).toBe("08:00");
  });

  test("a version bump from date exceptions alone does not conflict and the save retries", async () => {
    const user = userEvent.setup();
    await mount();
    setTime(timeInputs("tue")[0], "07:30");
    const bar = await screen.findByRole("region", { name: "Unsaved changes" });
    const cur = qc.getQueryData(KEYS.hours);
    await mock.saveExceptions({ businessId: cur.businessId, exceptions: [{ date: "2027-01-01", closed: true, open24: false, intervals: [] }], version: cur.hours_version });
    await user.click(within(bar).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Hours saved")).toBeInTheDocument();
    expect(screen.queryByTestId("conflict")).not.toBeInTheDocument();
    expect(qc.getQueryData(KEYS.hours).hours.tue.intervals[0].start).toBe("07:30");
  });

  test("Copy Monday to all asks first and can be undone", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: /Copy Monday to all/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Copy Monday to all days?")).toBeInTheDocument();
    expect(day("sun").querySelectorAll('input[type="time"]').length).toBe(0);
    await user.click(within(dialog).getByRole("button", { name: "Copy to all days" }));
    await waitFor(() => expect(day("sun").querySelectorAll('input[type="time"]').length).toBe(2));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(day("sun").querySelectorAll('input[type="time"]').length).toBe(0));
  });

  test("leaving with unsaved changes asks for confirmation", async () => {
    const user = userEvent.setup();
    const { router } = await mount();
    setTime(timeInputs("wed")[0], "07:30");
    await screen.findByRole("region", { name: "Unsaved changes" });
    await act(async () => {
      router.navigate("/elsewhere");
    });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Leave without saving?")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(router.state.location.pathname).toBe("/business/hours");
    await act(async () => {
      router.navigate("/elsewhere");
    });
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"));
  });
});

describe("temporary closure flow", () => {
  async function openLate(user) {
    await user.click(screen.getAllByRole("button", { name: "Open late" })[0]);
    return screen.findByRole("dialog");
  }

  test("message rules show a specific message for each failure and block confirming", async () => {
    const user = userEvent.setup();
    await mount();
    const status = qc.getQueryData(KEYS.hours);
    await mock.setClosureOverride({ businessId: status.businessId, override: { type: "open", until: new Date(Date.now() + 3600000).toISOString() } });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: KEYS.hours });
    });
    await waitFor(() => expect(screen.getByTestId("status-label")).toHaveTextContent(/^(Open|Closing soon)$/));
    await user.click(screen.getAllByRole("button", { name: "Close temporarily" })[0]);
    const dialog = await screen.findByRole("dialog");
    const box = within(dialog).getByLabelText(/Message for customers/);
    const confirm = () => within(dialog).getByRole("button", { name: /^Close until|^Close temporarily$/ });
    const cases = [
      ["see https://x.com", /Links are not allowed/],
      ["write me a@b.co", /Email addresses are not allowed/],
      ["call 0712 345 678", /Phone numbers are not allowed/],
      ["x".repeat(81), /80 characters or fewer/]
    ];
    for (const [text, expected] of cases) {
      fireEvent.change(box, { target: { value: text } });
      expect(await within(dialog).findByText(expected)).toBeInTheDocument();
      expect(confirm()).toBeDisabled();
    }
    fireEvent.change(box, { target: { value: "Back soon" } });
    expect(within(dialog).getByTestId("message-counter")).toHaveTextContent("9/80");
    await waitFor(() => expect(confirm()).toBeEnabled());
  });

  test("closing, extending and reopening with undo", async () => {
    const user = userEvent.setup();
    await mount();
    const dialog = await openLate(user);
    await user.click(within(dialog).getByRole("button", { name: /^Stay open until/ }));
    await waitFor(() => expect(screen.getByTestId("status-label")).toHaveTextContent(/^(Open|Closing soon)$/));
    await user.click(screen.getAllByRole("button", { name: "Close temporarily" })[0]);
    const closeDialog = await screen.findByRole("dialog");
    await user.click(within(closeDialog).getByRole("button", { name: "30 min" }));
    await user.click(within(closeDialog).getByRole("button", { name: /^Close until/ }));
    await waitFor(() => expect(screen.getByTestId("status-label")).toHaveTextContent("Closed temporarily"));
    const before = qc.getQueryData(KEYS.hours).override.until;

    await user.click(screen.getAllByRole("button", { name: "Extend" })[0]);
    const ext = await screen.findByRole("dialog");
    expect(within(ext).getByTestId("allowance")).toHaveTextContent(/up to 23 h 30 min more/);
    await user.click(within(ext).getByRole("button", { name: "+1 hour" }));
    await user.click(within(ext).getByRole("button", { name: /^Extend to/ }));
    await waitFor(() => expect(Date.parse(qc.getQueryData(KEYS.hours).override.until) - Date.parse(before)).toBe(3600000));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(qc.getQueryData(KEYS.hours).override.until).toBe(before));

    await user.click(screen.getAllByRole("button", { name: "Reopen now" })[0]);
    const confirm = await screen.findByRole("dialog");
    await user.click(within(confirm).getByRole("button", { name: "Reopen now" }));
    await waitFor(() => expect(qc.getQueryData(KEYS.hours).override).toBeNull());
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(qc.getQueryData(KEYS.hours).override?.type).toBe("close"));
    expect(qc.getQueryData(KEYS.hours).override.until).toBe(before);
  });

  test("extend disables choices that would pass 24 hours in total", async () => {
    const user = userEvent.setup();
    await mount();
    const b = qc.getQueryData(KEYS.hours);
    const since = Date.now() - 60000;
    await mock.setClosureOverride({ businessId: b.businessId, override: { type: "close", since: new Date(since).toISOString(), until: new Date(since + 23.5 * 3600000).toISOString(), reason: "power" } });
    await act(async () => {
      await qc.invalidateQueries({ queryKey: KEYS.hours });
    });
    await waitFor(() => expect(screen.getByTestId("status-label")).toHaveTextContent("Closed temporarily"));
    await user.click(screen.getAllByRole("button", { name: "Extend" })[0]);
    const ext = await screen.findByRole("dialog");
    expect(within(ext).getByRole("button", { name: "+30 min" })).toBeEnabled();
    expect(within(ext).getByRole("button", { name: "+1 hour" })).toBeDisabled();
    expect(within(ext).getByTestId("allowance")).toHaveTextContent(/up to 30 min more/);
  });
});
