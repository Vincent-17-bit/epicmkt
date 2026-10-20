import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, within, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { errorText } from "../../lib/errors.js";
import { UNDO_MS } from "./Exceptions.jsx";
import { M, signedInApp, setTime } from "../../test/utils.jsx";

const TODAY = "2026-10-12";
const NOW = `${TODAY}T09:00:00Z`;
const ex = (id, date, extra = {}) => ({ id, date, kind: "closed", intervals: [], note: null, ...extra });
const open = (seed = []) => signedInApp("/business/exceptions", () => { setTime(NOW); M.state.exceptions = seed; });
const rows = () => screen.queryAllByTestId("exception");
const dates = () => rows().map((r) => within(r).getByRole("heading").textContent.replace(/(Today|Tomorrow)$/, ""));
const setDate = (v) => fireEvent.change(screen.getByLabelText("Date"), { target: { value: v } });
const setTimes = (i, a, b) => {
  fireEvent.change(screen.getByLabelText(`Interval ${i + 1} opens`), { target: { value: a } });
  fireEvent.change(screen.getByLabelText(`Interval ${i + 1} closes`), { target: { value: b } });
};

afterEach(() => vi.useRealTimers());

describe("upcoming list", () => {
  it("shows upcoming exceptions sorted by date and hides past ones", async () => {
    await open([ex("c", "2026-12-25", { note: "Christmas" }), ex("old", "2026-10-11"), ex("a", "2026-10-13", { kind: "special", intervals: [["08:00", "12:00"], ["14:00", "18:00"]] }), ex("b", "2026-11-02")]);
    await screen.findAllByTestId("exception");
    expect(dates()).toEqual(["Tue 13 Oct 2026", "Mon 2 Nov 2026", "Fri 25 Dec 2026"]);
    expect(screen.getByTestId("exc-count")).toHaveTextContent("3 of 60 upcoming");
    expect(rows()[0]).toHaveTextContent("Special hours: 08:00 to 12:00, 14:00 to 18:00");
    expect(rows()[0]).toHaveTextContent("Tomorrow");
    expect(rows()[1]).toHaveTextContent("Closed all day");
    expect(rows()[2]).toHaveTextContent("Christmas");
    expect(screen.queryByText(/Sun 11 Oct|Sat 11 Oct|Mon 11 Oct/)).toBeNull();
    expect(screen.queryByText(/11 Oct 2026/)).toBeNull();
  });

  it("shows today, and an empty state with a hint", async () => {
    await open([ex("t", TODAY)]);
    expect(await screen.findByText("Today")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `Delete Mon 12 Oct 2026` }));
    expect(await screen.findByTestId("empty")).toHaveTextContent("No upcoming exceptions");
  });
});

describe("add", () => {
  it("adds a closed-all-day exception with a note, in the right place", async () => {
    const user = userEvent.setup();
    await open([ex("a", "2026-10-13"), ex("c", "2026-12-25")]);
    await screen.findAllByTestId("exception");
    await user.click(screen.getByRole("button", { name: "Add exception" }));
    setDate("2026-11-20");
    await user.type(screen.getByLabelText(/Note/), "Family event");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(dates()).toEqual(["Tue 13 Oct 2026", "Fri 20 Nov 2026", "Fri 25 Dec 2026"]);
    expect(rows()[1]).toHaveTextContent("Closed all day");
    expect(rows()[1]).toHaveTextContent("Family event");
    expect(screen.queryByRole("heading", { name: "Add an exception" })).toBeNull();
    expect(M.state.exceptions.find((e) => e.date === "2026-11-20")).toMatchObject({ kind: "closed", intervals: [], note: "Family event" });
  });

  it("adds special hours with two intervals, and offers at most three", async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(await screen.findByRole("button", { name: "Add exception" }));
    setDate("2026-10-31");
    await user.click(screen.getByLabelText("Special hours"));
    setTimes(0, "08:00", "12:00");
    await user.click(screen.getByRole("button", { name: "Add another interval" }));
    setTimes(1, "14:00", "17:00");
    await user.click(screen.getByRole("button", { name: "Add another interval" }));
    expect(screen.getByRole("button", { name: "Add another interval" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove interval 3" }));
    expect(screen.getByRole("button", { name: "Add another interval" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Special hours: 08:00 to 12:00, 14:00 to 17:00");
  });

  it("the date picker starts at today and ends within two years", async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(await screen.findByRole("button", { name: "Add exception" }));
    const input = screen.getByLabelText("Date");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("min", TODAY);
    expect(input).toHaveAttribute("max", addDays(TODAY, 730));
    expect(input).toHaveFocus();
  });

  it("explains each mistake in plain words and saves nothing", async () => {
    const user = userEvent.setup();
    await open([ex("a", "2026-10-20")]);
    await screen.findAllByTestId("exception");
    await user.click(screen.getByRole("button", { name: "Add exception" }));
    const save = () => user.click(screen.getByRole("button", { name: "Save" }));
    await save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a valid date");
    setDate("2026-10-11");
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("Past dates cannot be added");
    setDate("2026-10-20");
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("already have an exception on that date");
    setDate("2026-10-25");
    await user.click(screen.getByLabelText("Special hours"));
    fireEvent.change(screen.getByLabelText("Interval 1 opens"), { target: { value: "" } });
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("hours and minutes");
    setTimes(0, "09:00", "12:00");
    await user.click(screen.getByRole("button", { name: "Add another interval" }));
    setTimes(1, "11:00", "14:00");
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot overlap");
    expect(M.state.exceptions).toHaveLength(1);
  });

  it("explains overnight hours under the intervals and says which day the closing time falls on", async () => {
    const user = userEvent.setup();
    await open([]);
    await screen.findByTestId("empty");
    const save = () => user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Add exception" }));
    setDate("2026-10-23");
    await user.click(screen.getByLabelText("Special hours"));
    expect(screen.getByText(/Open past midnight\? Set the closing time earlier than the opening time/)).toBeInTheDocument();
    expect(screen.queryByTestId("overnight-0")).toBeNull();
    setTimes(0, "20:00", "02:00");
    expect(screen.getByTestId("overnight-0")).toHaveTextContent("Closes at 02:00 on Sat 24 Oct 2026. The hours after midnight are part of this interval.");
    setTimes(0, "09:00", "09:00");
    expect(screen.getByTestId("overnight-0")).toHaveTextContent("Open for 24 hours.");
    setTimes(0, "09:00", "17:00");
    expect(screen.queryByTestId("overnight-0")).toBeNull();
  });

  it("saves an overnight interval and lists it as running into the next day", async () => {
    const user = userEvent.setup();
    await open([]);
    await screen.findByTestId("empty");
    const save = () => user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Add exception" }));
    setDate("2026-10-23");
    await user.click(screen.getByLabelText("Special hours"));
    setTimes(0, "20:00", "02:00");
    await save();
    expect(await screen.findByText("Special hours: 20:00 to 02:00 the next day")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(M.state.exceptions.find((e) => e.date === "2026-10-23")).toMatchObject({ kind: "special", intervals: [["20:00", "02:00"]] });
  });

  it("refuses a second interval on the same date as an overnight one", async () => {
    const user = userEvent.setup();
    await open([]);
    await screen.findByTestId("empty");
    const save = () => user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(screen.getByRole("button", { name: "Add exception" }));
    setDate("2026-10-23");
    await user.click(screen.getByLabelText("Special hours"));
    setTimes(0, "20:00", "02:00");
    await user.click(screen.getByRole("button", { name: "Add another interval" }));
    setTimes(1, "22:00", "23:00");
    await save();
    expect(screen.getByRole("alert")).toHaveTextContent("cannot overlap");
    expect(M.state.exceptions).toHaveLength(0);
  });

  it("cancel closes the form without saving", async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(await screen.findByRole("button", { name: "Add exception" }));
    setDate("2026-11-01");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Date")).toBeNull();
    expect(M.state.exceptions).toHaveLength(0);
  });

  it("notes are plain text", async () => {
    const user = userEvent.setup();
    await open([]);
    await user.click(await screen.findByRole("button", { name: "Add exception" }));
    setDate("2026-11-01");
    await user.type(screen.getByLabelText(/Note/), "<img src=x onerror=alert(1)>");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].querySelector("img")).toBeNull();
    expect(rows()[0]).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});

describe("edit", () => {
  it("edits date, kind and note, keeping the same exception", async () => {
    const user = userEvent.setup();
    await open([ex("keep", "2026-10-20", { note: "Old note" }), ex("other", "2026-10-30")]);
    await screen.findAllByTestId("exception");
    await user.click(screen.getByRole("button", { name: "Edit Tue 20 Oct 2026" }));
    expect(screen.getByRole("heading", { name: "Edit exception" })).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-20");
    expect(screen.getByLabelText(/Note/)).toHaveValue("Old note");
    setDate("2026-11-05");
    await user.click(screen.getByLabelText("Special hours"));
    setTimes(0, "10:00", "13:00");
    await user.clear(screen.getByLabelText(/Note/));
    await user.type(screen.getByLabelText(/Note/), "Late start");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dates()).toEqual(["Fri 30 Oct 2026", "Thu 5 Nov 2026"]));
    expect(M.state.exceptions.find((e) => e.id === "keep")).toMatchObject({ date: "2026-11-05", kind: "special", intervals: [["10:00", "13:00"]], note: "Late start" });
    expect(M.state.exceptions).toHaveLength(2);
  });

  it("editing does not trip over its own date", async () => {
    const user = userEvent.setup();
    await open([ex("keep", "2026-10-20")]);
    await user.click(await screen.findByRole("button", { name: "Edit Tue 20 Oct 2026" }));
    await user.type(screen.getByLabelText(/Note/), "Just a note");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Just a note"));
  });
});

describe("delete with Undo", () => {
  it("deletes at once and Undo puts the same exception back where it was", async () => {
    const user = userEvent.setup();
    await open([ex("a", "2026-10-13"), ex("b", "2026-11-02", { kind: "special", intervals: [["09:00", "12:00"]], note: "Half day" }), ex("c", "2026-12-25")]);
    await screen.findAllByTestId("exception");
    await user.click(screen.getByRole("button", { name: "Delete Mon 2 Nov 2026" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(M.state.exceptions.map((e) => e.id)).toEqual(["a", "c"]);
    const toast = within(screen.getByTestId("toasts"));
    expect(toast.getByText("Exception for Mon 2 Nov 2026 deleted.")).toBeInTheDocument();
    await user.click(toast.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(dates()).toEqual(["Tue 13 Oct 2026", "Mon 2 Nov 2026", "Fri 25 Dec 2026"]);
    expect(rows()[1]).toHaveTextContent("Special hours: 09:00 to 12:00");
    expect(rows()[1]).toHaveTextContent("Half day");
    expect(M.state.exceptions.find((e) => e.id === "b")).toMatchObject({ kind: "special", note: "Half day" });
    expect(within(screen.getByTestId("toasts")).queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("the Undo offer goes away by itself after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await open([ex("a", "2026-10-13")]);
    await user.click(await screen.findByRole("button", { name: "Delete Tue 13 Oct 2026" }));
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(UNDO_MS - 500); });
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).toBeNull());
    expect(M.state.exceptions).toHaveLength(0);
  });

  it("each of several deletes can be undone separately", async () => {
    const user = userEvent.setup();
    await open([ex("a", "2026-10-13"), ex("b", "2026-10-14"), ex("c", "2026-10-15")]);
    await screen.findAllByTestId("exception");
    await user.click(screen.getByRole("button", { name: "Delete Tue 13 Oct 2026" }));
    await user.click(screen.getByRole("button", { name: "Delete Wed 14 Oct 2026" }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    const undos = screen.getAllByRole("button", { name: "Undo" });
    expect(undos).toHaveLength(2);
    await user.click(undos[0]);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(dates()).toEqual(["Tue 13 Oct 2026", "Thu 15 Oct 2026"]);
  });

  it("if the date was taken meanwhile, Undo explains instead of overwriting", async () => {
    const user = userEvent.setup();
    await open([ex("a", "2026-10-13", { note: "Original" })]);
    await user.click(await screen.findByRole("button", { name: "Delete Tue 13 Oct 2026" }));
    await screen.findByRole("button", { name: "Undo" });
    M.state.exceptions.push(ex("new", "2026-10-13", { note: "Added elsewhere" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not restore the exception for Tue 13 Oct 2026");
    expect(M.state.exceptions).toHaveLength(1);
    expect(M.state.exceptions[0].note).toBe("Added elsewhere");
  });

  it("deleting the one being edited closes the form", async () => {
    const user = userEvent.setup();
    await open([ex("a", "2026-10-13")]);
    await user.click(await screen.findByRole("button", { name: "Edit Tue 13 Oct 2026" }));
    expect(screen.getByRole("heading", { name: "Edit exception" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete Tue 13 Oct 2026" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Edit exception" })).toBeNull());
  });
});

describe("limit of 60", () => {
  const sixty = () => Array.from({ length: 60 }, (_, i) => ex(`e${i}`, addDays(TODAY, i + 1)));

  it("shows a friendly message, blocks Add, but still allows editing and deleting", async () => {
    const user = userEvent.setup();
    await open(sixty());
    await screen.findAllByTestId("exception");
    expect(screen.getByTestId("exc-count")).toHaveTextContent("60 of 60 upcoming");
    const notice = screen.getByTestId("limit-notice");
    expect(notice).toHaveTextContent("You have 60 upcoming exceptions, the most we can keep.");
    expect(notice).toHaveTextContent("Delete one you no longer need, or wait for a date to pass");
    expect(screen.getByRole("button", { name: "Add exception" })).toBeDisabled();
    await user.click(screen.getAllByRole("button", { name: /^Edit / })[0]);
    expect(screen.getByRole("heading", { name: "Edit exception" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getAllByRole("button", { name: /^Delete / })[0]);
    await waitFor(() => expect(screen.queryByTestId("limit-notice")).toBeNull());
    expect(screen.getByRole("button", { name: "Add exception" })).toBeEnabled();
  });

  it("59 is fine; the 61st is refused by the server too, with the same friendly words", async () => {
    await open(sixty().slice(0, 59));
    await screen.findAllByTestId("exception");
    expect(screen.queryByTestId("limit-notice")).toBeNull();
    await api.saveException({ date: addDays(TODAY, 90), kind: "closed" });
    const err = await api.saveException({ date: addDays(TODAY, 91), kind: "closed" }).catch((e) => e);
    expect(err.code).toBe("limit_reached");
    expect(errorText(err)).toContain("limit of 60 upcoming exceptions");
  });

  it("past exceptions do not count toward the 60", async () => {
    await open([...sixty().slice(0, 59), ex("old1", "2026-01-01"), ex("old2", "2026-02-01")]);
    await screen.findAllByTestId("exception");
    expect(screen.getByTestId("exc-count")).toHaveTextContent("59 of 60 upcoming");
    expect(screen.getByRole("button", { name: "Add exception" })).toBeEnabled();
  });
});

describe("access and layout", () => {
  it("works for unlisted and expired sellers, but a suspended seller is locked out of the page", async () => {
    for (const status of ["paused", "expired"]) {
      const user = userEvent.setup();
      const { unmount } = await signedInApp("/business/exceptions", () => { setTime(NOW); M.state.business.status = status; M.state.exceptions = []; });
      await user.click(await screen.findByRole("button", { name: "Add exception" }));
      setDate("2026-11-10");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(rows()).toHaveLength(1));
      unmount();
    }
    await signedInApp("/business/exceptions", () => { setTime(NOW); M.state.business.status = "suspended"; M.state.exceptions = []; });
    expect(await screen.findByTestId("locked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add exception" })).toBeNull();
  });

  it("is in the navigation", async () => {
    await open([]);
    const nav = await screen.findByRole("navigation", { name: "Business" });
    expect(within(nav).getByRole("link", { name: "Exceptions" })).toHaveAttribute("href", "/business/exceptions");
  });

  it("stacks on phones and keeps the Undo bar above the safe area", () => {
    const css = readFileSync(join(process.cwd(), "src/pages/business/exceptions.module.css"), "utf8");
    const small = css.slice(css.indexOf("@media (max-width: 40rem)"));
    expect(small).toMatch(/\.row\s*{[^}]*grid-template-columns:\s*1fr/);
    expect(small).toMatch(/\.interval\s*{[^}]*grid-template-columns:\s*1fr 1fr/);
    expect(css).toMatch(/\.toasts\s*{[^}]*safe-bottom/);
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
