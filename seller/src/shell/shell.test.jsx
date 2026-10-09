import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshSession, renderApp, signInAs } from "../test/helpers.jsx";
import { ThemeProvider, THEME_KEY, useTheme } from "../state/theme.jsx";
import { useIdle } from "../state/useIdle.js";
import * as mock from "../api/mock.js";

beforeEach(freshSession);

const open = async (id, path = "/") => {
  await signInAs(id);
  const view = renderApp(path);
  await screen.findByTestId("header");
  return view;
};

describe("plan badge and status chip come from data", () => {
  it.each([
    ["ES100001", "standard", "Standard", "Live"],
    ["ES100002", "premium", "Premium", "Live"],
    ["ES100004", "standard", "Standard", "Grace period"],
    ["ES100005", "premium", "Premium", "Hidden"],
    ["ES100006", "standard", "Standard", "Paused"],
    ["ES100007", "standard", "Standard", "Suspended"]
  ])("%s shows %s and %s", async (id, plan, label, chip) => {
    await open(id);
    const header = screen.getByTestId("header");
    const badge = within(header).getByText(label).closest("[data-plan]");
    expect(badge).toHaveAttribute("data-plan", plan);
    expect(header.querySelector("[data-state]")).toHaveTextContent(chip);
  });

  it("shows the unread count on the bell", async () => {
    await open("ES100002");
    expect(screen.getByRole("link", { name: "Notifications, 2 unread" })).toBeInTheDocument();
  });
});

describe("listing state guards", () => {
  it("live: everything open and no banner when more than 7 days remain", async () => {
    await open("ES100001", "/catalog");
    expect(await screen.findByRole("heading", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("locked-state")).toBeNull();
  });

  it("live with 7 days or fewer: a notice banner with Renew", async () => {
    await open("ES100002");
    const node = await waitFor(() => {
      const el = document.querySelector('[data-kind="expiring"]');
      expect(el).not.toBeNull();
      return el;
    });
    expect(node).toHaveTextContent("expires in 5 days");
    expect(within(node).getByRole("link", { name: "Renew" })).toHaveAttribute("href", "/subscription");
  });

  it("grace: an urgent banner with Renew and a highlighted Subscription", async () => {
    await open("ES100004");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("expires today");
    expect(within(alert).getByRole("link", { name: "Renew" })).toBeInTheDocument();
    expect(document.querySelector('a[href="/subscription"][data-attention="true"]')).not.toBeNull();
  });

  it("expired: still editable, banner says hidden, Subscription highlighted", async () => {
    await open("ES100005", "/catalog");
    expect(await screen.findByRole("heading", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("hidden");
    expect(document.querySelector('a[href="/subscription"][data-attention="true"]')).not.toBeNull();
    expect(screen.queryByTestId("locked-state")).toBeNull();
  });

  it("paused: a banner with Resume that brings the listing back", async () => {
    await open("ES100006");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(screen.getByTestId("header").querySelector("[data-state]")).toHaveTextContent("Live"));
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
  });

  it.each([
    ["ES100007", "Your listing is suspended", "Reported for misleading prices"],
    ["ES100008", "Your listing is not live yet", null]
  ])("%s is read-only with a full-page state", async (id, title, reason) => {
    const { router } = await open(id);
    const state = await screen.findByTestId("locked-state");
    expect(within(state).getByRole("heading", { name: title })).toBeInTheDocument();
    if (reason) expect(state).toHaveTextContent(reason);
    for (const path of ["/catalog", "/account", "/offers", "/settings"]) {
      await act(() => router.navigate(path));
      expect(await screen.findByTestId("locked-state")).toBeInTheDocument();
    }
    for (const [path, heading] of [["/subscription", "Subscription"], ["/notifications", "Notifications"], ["/help", "Help"]]) {
      await act(() => router.navigate(path));
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      expect(screen.queryByTestId("locked-state")).toBeNull();
    }
  });

  it("deleted: blocked at sign-in", async () => {
    await expect(mock.login("ES100009", mock.DEMO_PASSWORD)).rejects.toMatchObject({ code: "deleted" });
  });
});

describe("simulator transitions drive the guards", () => {
  it.each([
    ["grace", "grace"],
    ["expire", "expired"],
    ["suspend", "suspended"],
    ["pause", "paused"]
  ])("%s moves the listing to %s", async (action, state) => {
    await open("ES100001");
    await act(async () => {
      await mock.simulate(action, "ES100001");
      const { useSession } = await import("../state/session.js");
      await useSession.getState().refresh();
    });
    await waitFor(() => expect(screen.getByTestId("header").querySelector("[data-state]")).toHaveAttribute("data-state", state));
  });
});

describe("shell structure", () => {
  it("keeps the header outside the single scroll container", async () => {
    await open("ES100001");
    const header = screen.getByTestId("header");
    const content = screen.getByTestId("content");
    expect(content.contains(header)).toBe(false);
    expect(document.querySelectorAll('[data-testid="content"]')).toHaveLength(1);
    expect(header.parentElement).toBe(content.parentElement);
  });

  it("offers a menu button, bottom navigation and a More sheet", async () => {
    await open("ES100001");
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    const bottom = screen.getByRole("navigation", { name: "Primary" });
    ["Home", "Catalog", "Account", "Offers", "More"].forEach((label) => expect(within(bottom).getByText(label)).toBeInTheDocument());
    fireEvent.click(within(bottom).getByRole("button", { name: /More/ }));
    const sheet = await screen.findByRole("heading", { name: "More" });
    const list = sheet.closest("div");
    ["Subscription", "Notifications", "Help", "Settings", "Sign out"].forEach((label) => expect(within(list).getByText(label)).toBeInTheDocument());
  });

  it("opens the avatar menu with Settings, Help, theme and sign out", async () => {
    await open("ES100001");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Settings/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Help/ })).toBeInTheDocument();
    expect(within(menu).getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: /Sign out/ }));
    expect(await screen.findByRole("heading", { name: "Seller login" })).toBeInTheDocument();
  });

  it("toggles and remembers the sidebar with the [ key", async () => {
    await open("ES100001");
    const shell = document.querySelector("[data-collapsed]");
    expect(shell).toHaveAttribute("data-collapsed", "false");
    fireEvent.keyDown(window, { key: "[" });
    expect(shell).toHaveAttribute("data-collapsed", "true");
    expect(window.localStorage.getItem("epicmkt-seller-sidebar")).toBe("collapsed");
    fireEvent.keyDown(window, { key: "[" });
    expect(shell).toHaveAttribute("data-collapsed", "false");
  });

  it("ignores the [ key while typing", async () => {
    await open("ES100001");
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    fireEvent.keyDown(input, { key: "[" });
    expect(document.querySelector("[data-collapsed]")).toHaveAttribute("data-collapsed", "false");
    input.remove();
  });
});

describe("dashboard", () => {
  it("shows a premium dashboard with extras", async () => {
    await open("ES100002");
    expect(await screen.findByRole("heading", { name: "Customer activity" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Flash sales this month" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Listing progress" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Listing health 100 percent" })).toBeInTheDocument();
  });

  it("shows fewer extras on Standard and splits blocking from recommended to-dos", async () => {
    await open("ES100001");
    expect(screen.queryByRole("heading", { name: "Customer activity" })).toBeNull();
    expect(screen.queryByRole("progressbar", { name: "Flash sales this month" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Blocking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recommended" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stock watch" })).toBeInTheDocument();
  });

  it("uses friendly empty states instead of fake data for a brand-new seller", async () => {
    await open("ES100008");
    await act(async () => {
      await mock.simulate("activate", "ES100008");
      const { useSession } = await import("../state/session.js");
      await useSession.getState().refresh();
    });
    expect(await screen.findByText(/Your catalog is empty/)).toBeInTheDocument();
    expect(screen.getByText(/Stock alerts appear once you add items/)).toBeInTheDocument();
    expect(screen.getByText(/Usage shows here/)).toBeInTheDocument();
    expect(screen.getByText(/No questions are waiting/)).toBeInTheDocument();
  });

  it("renders the real shop card in preview mode, inert", async () => {
    await open("ES100001");
    const card = document.querySelector('article[data-mode="preview"]');
    expect(card).not.toBeNull();
    expect(card.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("walks the lifecycle stepper", async () => {
    await open("ES100001");
    const steps = within(await screen.findByRole("list", { name: "Listing progress" })).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent.replace(/[✓\d]/g, ""))).toEqual(["Applied", "Reviewed", "Approved", "Paid", "Live"]);
    expect(steps[4]).toHaveAttribute("aria-current", "step");
  });
});

describe("theme", () => {
  const Probe = () => {
    const { mode, resolved, setMode } = useTheme();
    return (
      <div>
        <span data-testid="mode">{mode}</span>
        <span data-testid="resolved">{resolved}</span>
        <button onClick={() => setMode("dark")}>dark</button>
        <button onClick={() => setMode("light")}>light</button>
        <button onClick={() => setMode("system")}>system</button>
      </div>
    );
  };

  const withScheme = (dark) => {
    const listeners = new Set();
    window.matchMedia = (query) => ({ matches: dark && query.includes("dark"), media: query, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) });
    return listeners;
  };

  afterEach(() => {
    window.matchMedia = globalThis.__defaultMatchMedia;
    delete document.documentElement.dataset.theme;
  });

  it("defaults to System and follows the device", () => {
    withScheme(true);
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("remembers Light, Dark and System on the device", async () => {
    withScheme(true);
    const first = render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText("light"));
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    first.unmount();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByText("dark"));
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    fireEvent.click(screen.getByText("system"));
    expect(window.localStorage.getItem(THEME_KEY)).toBe("system");
  });

  it("ignores junk in storage", () => {
    withScheme(false);
    window.localStorage.setItem(THEME_KEY, "neon");
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });
});

describe("idle timeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("warns 60 seconds before sign-out, signs out on time and can be postponed", () => {
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdle({ minutes: 15, active: true, onTimeout }));
    act(() => vi.advanceTimersByTime(14 * 60 * 1000 - 1000));
    expect(result.current.warning).toBe(false);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.warning).toBe(true);
    expect(result.current.remaining).toBeLessThanOrEqual(60);
    act(() => result.current.stay());
    expect(result.current.warning).toBe(false);
    act(() => vi.advanceTimersByTime(14 * 60 * 1000));
    expect(onTimeout).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(61 * 1000));
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("treats activity before the warning as proof of life", () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdle({ minutes: 15, active: true, onTimeout }));
    for (let i = 0; i < 4; i += 1) {
      act(() => vi.advanceTimersByTime(10 * 60 * 1000));
      act(() => {
        window.dispatchEvent(new Event("pointerdown"));
      });
    }
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("only accepts 15, 30, 60 or 120 minutes and defaults to 60", async () => {
    const { idleMinutes } = await import("../state/useIdle.js");
    expect([15, 30, 60, 120].map(idleMinutes)).toEqual([15, 30, 60, 120]);
    expect([5, 90, undefined, "60"].map(idleMinutes)).toEqual([60, 60, 60, 60]);
  });
});
