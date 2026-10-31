import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as api from "../../api/index.js";
import * as mock from "../../api/mock.js";
import Hours from "./Hours.jsx";
import { M, signedInApp, setTime } from "../../test/utils.jsx";

const NOW = "2026-10-12T09:00:00Z"; // Monday 12:00 in Nairobi
const OPEN = ["08:00", "18:00"];
const open = (hours, path = "/business/hours") => signedInApp(path, () => { setTime(NOW); M.setBusiness({ hours }); });
// Signs in without mounting the app, for the tests that render the page on its own.
const signInOnly = async (patch) => {
  mock.resetMock();
  setTime(NOW);
  await api.login("ES100001", "Demo-Passw0rd");
  M.setBusiness(patch);
};
const day = (d) => screen.getByTestId(`day-${d}`);
const sw = (d, name) => within(day(d)).getByRole("switch", { name: `${name} Open` });
const times = (d) => [within(day(d)).getByLabelText("Opens"), within(day(d)).getByLabelText("Closes")];
const setTimes = (d, a, b) => {
  const [start, end] = times(d);
  fireEvent.change(start, { target: { value: a } });
  fireEvent.change(end, { target: { value: b } });
};
const stored = async () => (await api.getSubscription()).business.hours;
const NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

describe("empty state", () => {
  it("shows the empty message, seven closed days and a preview that says the hours are not set", async () => {
    await open({});
    expect(await screen.findByTestId("empty")).toHaveTextContent("You have not set your opening hours yet");
    expect(screen.getByRole("heading", { name: "Opening hours" })).toBeInTheDocument();
    for (const d of Object.keys(NAMES)) {
      expect(within(day(d)).getByRole("heading", { name: NAMES[d] })).toBeInTheDocument();
      expect(sw(d, NAMES[d])).not.toBeChecked();
      expect(within(day(d)).getByText("Closed")).toBeInTheDocument();
      expect(within(day(d)).queryByLabelText("Opens")).toBeNull();
    }
    expect(screen.getByTestId("hours-preview")).toHaveTextContent("Closed");
    expect(screen.getByTestId("hours-preview-line")).toHaveTextContent("Opening hours not set");
  });

  it("shows saved hours instead, without the empty message", async () => {
    await open({ mon: OPEN, sun: ["20:00", "02:00"] });
    await screen.findByTestId("day-mon");
    expect(screen.queryByTestId("empty")).toBeNull();
    expect(sw("mon", "Monday")).toBeChecked();
    expect(times("mon").map((i) => i.value)).toEqual(OPEN);
    expect(times("sun").map((i) => i.value)).toEqual(["20:00", "02:00"]);
    expect(screen.getByTestId("overnight-sun")).toHaveTextContent("Closes at 02:00 the next day");
    expect(sw("tue", "Tuesday")).not.toBeChecked();
  });
});

describe("saving", () => {
  it("saves the week through api.setHours, invalidates the subscription query and refills from what was stored", async () => {
    const user = userEvent.setup();
    const { client } = await open({});
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByTestId("empty");
    await user.click(sw("mon", "Monday"));
    setTimes("mon", "09:00", "17:30");
    await user.click(sw("sat", "Saturday"));
    expect(screen.getByTestId("hours-dirty")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByTestId("hours-saved")).toHaveTextContent("Your opening hours are saved");
    expect(await stored()).toEqual({ mon: ["09:00", "17:30"], sat: OPEN });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subscription"] });
    expect(screen.queryByTestId("empty")).toBeNull();
    expect(screen.queryByTestId("hours-dirty")).toBeNull();
    expect(sw("tue", "Tuesday")).not.toBeChecked();
  });

  it("closing a day removes it from the stored hours", async () => {
    const user = userEvent.setup();
    await open({ mon: OPEN, tue: OPEN });
    await screen.findByTestId("day-mon");
    await user.click(sw("tue", "Tuesday"));
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByTestId("hours-saved");
    expect(await stored()).toEqual({ mon: OPEN });
  });

  it("Open 24 hours stores 00:00 to 23:59 and can be switched back", async () => {
    const user = userEvent.setup();
    await open({});
    await screen.findByTestId("empty");
    const btn = screen.getByRole("button", { name: "Wednesday: open 24 hours" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await user.click(btn);
    expect(sw("wed", "Wednesday")).toBeChecked();
    expect(times("wed").map((i) => i.value)).toEqual(["00:00", "23:59"]);
    expect(screen.getByRole("button", { name: "Wednesday: open 24 hours" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByTestId("hours-saved");
    expect(await stored()).toEqual({ wed: ["00:00", "23:59"] });
    await user.click(screen.getByRole("button", { name: "Wednesday: open 24 hours" }));
    expect(times("wed").map((i) => i.value)).toEqual(OPEN);
  });

  it("Copy to all weekdays copies one day to Monday to Friday and leaves the weekend alone", async () => {
    const user = userEvent.setup();
    await open({ sat: ["10:00", "14:00"], sun: ["11:00", "13:00"] });
    await screen.findByTestId("day-sat");
    await user.click(screen.getByRole("button", { name: "Copy Saturday to all weekdays" }));
    expect(screen.getByTestId("hours-notice")).toHaveTextContent("Copied Saturday to Monday to Friday");
    for (const d of ["mon", "tue", "wed", "thu", "fri"]) expect(times(d).map((i) => i.value)).toEqual(["10:00", "14:00"]);
    expect(times("sun").map((i) => i.value)).toEqual(["11:00", "13:00"]);
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    await screen.findByTestId("hours-saved");
    expect(await stored()).toEqual({ mon: ["10:00", "14:00"], tue: ["10:00", "14:00"], wed: ["10:00", "14:00"], thu: ["10:00", "14:00"], fri: ["10:00", "14:00"], sat: ["10:00", "14:00"], sun: ["11:00", "13:00"] });
  });

  it("copying a closed day closes the weekdays", async () => {
    const user = userEvent.setup();
    await open({ mon: OPEN, tue: OPEN });
    await screen.findByTestId("day-mon");
    await user.click(screen.getByRole("button", { name: "Copy Sunday to all weekdays" }));
    for (const d of ["mon", "tue", "wed", "thu", "fri"]) expect(sw(d, NAMES[d])).not.toBeChecked();
  });
});

describe("errors", () => {
  it("shows a validation error in the banner, marks the inputs and saves nothing", async () => {
    const user = userEvent.setup();
    await open({});
    await screen.findByTestId("empty");
    await user.click(sw("mon", "Monday"));
    setTimes("mon", "09:00", "09:00");
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Your opening hours were not saved");
    expect(banner).toHaveTextContent("Monday: The opening and closing times are the same");
    for (const input of times("mon")) expect(input).toHaveAttribute("aria-invalid", "true");
    expect(await stored()).toEqual({});
    expect(screen.getByTestId("hours-preview")).toHaveTextContent("Fix the times marked above");
    expect(screen.queryByTestId("hours-saved")).toBeNull();
  });

  it("lists every problem, and an empty time counts as one", async () => {
    const user = userEvent.setup();
    await open({ mon: OPEN, tue: OPEN });
    await screen.findByTestId("day-mon");
    setTimes("mon", "", "18:00");
    setTimes("tue", "10:00", "10:00");
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    const items = within(await screen.findByRole("alert")).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Monday: Enter each time as hours and minutes.", expect.stringMatching(/^Tuesday: The opening and closing times are the same/)]);
  });

  it("shows what the server refused, in the same banner", async () => {
    const user = userEvent.setup();
    await signInOnly({ hours: { mon: OPEN } });
    // The page alone, so the suspension that happens behind its back reaches the save call.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Hours /></MemoryRouter></QueryClientProvider>);
    await screen.findByTestId("day-mon");
    M.state.business.status = "suspended";
    await user.click(sw("tue", "Tuesday"));
    await user.click(screen.getByRole("button", { name: "Save hours" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account is suspended, so you cannot do this.");
    expect(M.state.business.hours).toEqual({ mon: OPEN });
  });
});

describe("live preview", () => {
  it("says Open now with the closing time, then Reopens ... as soon as the edit closes the shop", async () => {
    await open({ mon: OPEN, tue: OPEN });
    await screen.findByTestId("day-mon");
    expect(screen.getByTestId("hours-preview")).toHaveTextContent("Open now");
    expect(screen.getByTestId("hours-preview-line")).toHaveTextContent("Closes 6:00 PM");
    setTimes("mon", "08:00", "11:00");
    await waitFor(() => expect(screen.getByTestId("hours-preview")).toHaveTextContent("Closed"));
    expect(screen.getByTestId("hours-preview-line")).toHaveTextContent(/Reopens tomorrow at 8:00 AM/);
    setTimes("tue", "07:00", "11:00");
    await waitFor(() => expect(screen.getByTestId("hours-preview-line")).toHaveTextContent(/Reopens tomorrow at 7:00 AM/));
  });

  it("names the next open day when the next few days are closed", async () => {
    await open({ mon: ["08:00", "11:00"], thu: OPEN });
    await screen.findByTestId("day-mon");
    expect(screen.getByTestId("hours-preview-line")).toHaveTextContent(/Reopens Thu at 8:00 AM/);
  });
});

describe("keyboard and labels", () => {
  it("every control has an accessible name, and the switch, shortcuts and Save work from the keyboard", async () => {
    const user = userEvent.setup();
    await open({});
    await screen.findByTestId("empty");
    for (const d of Object.keys(NAMES)) {
      expect(sw(d, NAMES[d])).toHaveAccessibleName(`${NAMES[d]} Open`);
      expect(screen.getByRole("button", { name: `${NAMES[d]}: open 24 hours` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Copy ${NAMES[d]} to all weekdays` })).toBeInTheDocument();
    }
    sw("mon", "Monday").focus();
    await user.keyboard(" ");
    expect(sw("mon", "Monday")).toBeChecked();
    const [start, end] = times("mon");
    expect(start).toHaveAccessibleName("Opens");
    expect(end).toHaveAccessibleName("Closes");
    await user.tab();
    expect(start).toHaveFocus();
    const allDay = screen.getByRole("button", { name: "Monday: open 24 hours" });
    allDay.focus();
    await user.keyboard("{Enter}");
    expect(times("mon").map((i) => i.value)).toEqual(["00:00", "23:59"]);
    screen.getByRole("button", { name: "Save hours" }).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("hours-saved")).toBeInTheDocument();
    expect(await stored()).toEqual({ mon: ["00:00", "23:59"] });
  });
});

describe("suspended sellers", () => {
  it("cannot open the page inside the app: the existing lock replaces it", async () => {
    await signedInApp("/business/hours", () => { M.setBusiness({ status: "suspended", statusReason: "Test" }); });
    expect(await screen.findByTestId("locked")).toHaveTextContent("not available while your account is suspended");
    expect(screen.queryByRole("form", { name: "Opening hours" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Opening hours" })).toBeNull();
  });

  it("the page itself is read only when it is reached anyway", async () => {
    await signInOnly({ hours: { mon: OPEN }, status: "suspended" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Hours /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByTestId("hours-locked")).toHaveTextContent("You cannot change your opening hours");
    expect(screen.getByRole("button", { name: "Save hours" })).toBeDisabled();
    expect(sw("mon", "Monday")).toBeDisabled();
    expect(times("mon")[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy Monday to all weekdays" })).toBeDisabled();
  });
});

describe("navigation and themes", () => {
  it("the More menu links to the page, and the page opens at /business/hours", async () => {
    await open({ mon: OPEN });
    await screen.findByTestId("day-mon");
    const nav = screen.getByRole("navigation", { name: "Business" });
    const more = within(nav).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("data-active", "true");
    await userEvent.setup().click(more);
    const link = within(nav).getByRole("link", { name: "Opening hours" });
    expect(link).toHaveAttribute("href", "/business/hours");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("renders in the light and the dark theme", async () => {
    const user = userEvent.setup();
    await open({ mon: OPEN });
    await screen.findByTestId("day-mon");
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByTestId("day-mon")).toBeInTheDocument();
    expect(sw("mon", "Monday")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  const root = process.cwd();
  const read = (p) => readFileSync(join(root, p), "utf8");
  const sharedTokens = readFileSync(join(root, "..", "ui", "src", "styles", "tokens.css"), "utf8");
  const sellerCss = read("src/styles/seller.css");
  const block = (css, selector) => {
    const start = css.indexOf(selector);
    return start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
  };

  it("hours.module.css uses only variables that exist in both themes, and no hard-coded colour", () => {
    const css = read("src/pages/business/hours.module.css");
    const light = block(sharedTokens, ':root,\n[data-theme="light"]') + block(sellerCss, ':root,\n[data-theme="light"]');
    const dark = block(sharedTokens, '[data-theme="dark"]') + block(sellerCss, '[data-theme="dark"]');
    const rootVars = block(sharedTokens, ":root {");
    const used = [...new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(10);
    const missing = used.filter((v) => !rootVars.includes(`${v}:`) && !(light.includes(`${v}:`) && dark.includes(`${v}:`)));
    expect(missing).toEqual([]);
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).not.toMatch(/\b(rgb|hsl)a?\(/);
  });

  it("uses a tap-sized target for the shortcuts and a focus ring on the custom controls", () => {
    const css = read("src/pages/business/hours.module.css");
    expect(css).toMatch(/\.chip\s*{[^}]*min-height:\s*var\(--tap\)/);
    expect(css).toMatch(/\.switch input:focus-visible\s*{[^}]*var\(--focus-ring\)/);
    expect(css).toMatch(/\.chip:focus-visible\s*{[^}]*var\(--focus-ring\)/);
  });
});
