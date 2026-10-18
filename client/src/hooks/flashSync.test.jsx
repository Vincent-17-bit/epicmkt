import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FlashStrip from "../components/FlashStrip.jsx";
import CountdownProvider from "../components/CountdownProvider.jsx";
import { resetClock } from "../lib/clock.js";
import { invalidateSnapshot } from "../api/flash/snapshot.js";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  live: true,
  handler: null,
  status: null,
  unsubscribed: 0,
  serverNow: () => new Date().toISOString()
}));

vi.mock("../api/index.js", () => ({
  flash: { list: (...a) => api.list(...a), facets: vi.fn(async () => ({ total: 0, categories: [], towns: [] })) },
  getServerTime: async () => ({ now: api.serverNow() })
}));
vi.mock("../api/flash/mode.js", () => ({ isLive: () => api.live }));
vi.mock("../api/flash/live.js", () => ({
  subscribe: (onEvent, onStatus) => {
    api.handler = onEvent;
    api.status = onStatus;
    onStatus?.("SUBSCRIBED");
    return () => {
      api.unsubscribed += 1;
    };
  }
}));

const entry = (id, name, endsInMs, price = 800) => ({
  sale: { id, headline: null, quantityNote: null, startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + endsInMs).toISOString(), discount: { type: "percent", value: 20 } },
  item: { id: `item-${id}`, name, imageUrl: null },
  pricing: { regularPrice: 1000, salePrice: price, savings: 1000 - price, discountPercent: 20 },
  business: { id: "b", slug: "shop-a", name: "Shop A", logo: null, verified: false, distanceKm: null, isOpen: true }
});

const answer = (...entries) => api.list.mockImplementation(async () => ({ items: entries, total: entries.length }));

let client;
const mount = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CountdownProvider>
          <FlashStrip businessId="b" heat={false} />
        </CountdownProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );

const settle = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const calls = () => api.list.mock.calls.length;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  api.list.mockReset();
  api.live = true;
  api.handler = null;
  api.status = null;
  api.unsubscribed = 0;
  api.serverNow = () => new Date().toISOString();
  resetClock();
  invalidateSnapshot();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("flash cards stay in step with the server", () => {
  it("a card whose end is reached is removed once the server stops returning it", async () => {
    answer(entry("a", "Fade", 3000), entry("b", "Wash", 3600000));
    mount();
    await settle(100);
    expect(screen.getByText("Fade")).toBeInTheDocument();
    answer(entry("b", "Wash", 3600000));
    await settle(3500);
    expect(screen.queryByText("Fade")).toBeNull();
    expect(screen.getByText("Wash")).toBeInTheDocument();
  });

  it("with a clock that is not confirmed it keeps the card at zero until the server answers", async () => {
    api.serverNow = () => {
      throw new Error("no clock");
    };
    answer(entry("a", "Fade", 3000));
    mount();
    await settle(100);
    const before = calls();
    await settle(3500);
    expect(calls()).toBeGreaterThan(before);
    expect(screen.getByText("Fade")).toBeInTheDocument();
    answer();
    await settle(2000);
    expect(screen.queryByText("Fade")).toBeNull();
  });

  it("once the clock is confirmed a card goes at zero and the list is refetched", async () => {
    answer(entry("a", "Fade", 3000), entry("b", "Wash", 3600000));
    mount();
    await settle(100);
    const before = calls();
    await settle(3600);
    expect(screen.queryByText("Fade")).toBeNull();
    expect(calls()).toBeGreaterThan(before);
  });

  it("a new sale appears and a cancelled one disappears within a second of the realtime event", async () => {
    answer();
    mount();
    await settle(100);
    expect(screen.queryByText("Fade")).toBeNull();
    answer(entry("a", "Fade", 3600000));
    act(() => api.handler());
    await settle(1000);
    expect(screen.getByText("Fade")).toBeInTheDocument();
    answer();
    act(() => api.handler());
    await settle(1000);
    expect(screen.queryByText("Fade")).toBeNull();
  });

  it("a price change reaches an open page", async () => {
    answer(entry("a", "Fade", 3600000, 800));
    mount();
    await settle(100);
    expect(screen.getByText(/800/)).toBeInTheDocument();
    answer(entry("a", "Fade", 3600000, 700));
    act(() => api.handler());
    await settle(1000);
    expect(screen.getByText(/700/)).toBeInTheDocument();
  });

  it("polls every 30 seconds while realtime is not connected, and rarely while it is", async () => {
    answer(entry("a", "Fade", 3600000));
    mount();
    await settle(100);
    act(() => api.status("CHANNEL_ERROR"));
    await settle(1000);
    const base = calls();
    await settle(30_000);
    expect(calls()).toBeGreaterThanOrEqual(base + 1);
    await settle(30_000);
    expect(calls()).toBeGreaterThanOrEqual(base + 2);
    act(() => api.status("SUBSCRIBED"));
    await settle(1000);
    const connected = calls();
    await settle(60_000);
    expect(calls() - connected).toBeLessThanOrEqual(1);
  });

  it("polls when realtime is unavailable altogether (mock mode)", async () => {
    api.live = false;
    answer(entry("a", "Fade", 3600000));
    mount();
    await settle(100);
    const base = calls();
    await settle(30_000);
    expect(calls()).toBeGreaterThan(base);
    expect(api.handler).toBeNull();
  });

  it("refetches on focus, reconnect and when the tab becomes visible again", async () => {
    answer(entry("a", "Fade", 3600000));
    mount();
    await settle(100);
    for (const [target, name] of [[window, "focus"], [window, "online"], [window, "pageshow"], [document, "visibilitychange"]]) {
      const before = calls();
      act(() => target.dispatchEvent(new Event(name)));
      await settle(500);
      expect(calls(), name).toBeGreaterThan(before);
    }
  });

  it("does not refetch from a hidden tab on the timer", async () => {
    answer(entry("a", "Fade", 3600000));
    api.live = false;
    mount();
    await settle(100);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    const base = calls();
    await settle(95_000);
    expect(calls()).toBe(base);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  it("keeps other tabs of the same browser in sync", async () => {
    const channels = new Set();
    class Fake {
      constructor() {
        channels.add(this);
      }
      postMessage(message) {
        channels.forEach((other) => other !== this && other.onmessage?.({ data: message }));
      }
      close() {
        channels.delete(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", Fake);
    answer(entry("a", "Fade", 3600000));
    mount();
    await settle(100);
    const other = new Fake();
    const before = calls();
    other.postMessage("refresh");
    await settle(500);
    expect(calls()).toBeGreaterThan(before);
    const next = calls();
    act(() => api.handler());
    await settle(500);
    expect(calls()).toBeGreaterThan(next);
    let heard = 0;
    other.onmessage = () => {
      heard += 1;
    };
    act(() => api.handler());
    await settle(500);
    expect(heard).toBe(1);
    vi.unstubAllGlobals();
  });

  it("stops listening when the app unmounts", async () => {
    answer();
    const view = mount();
    await settle(100);
    view.unmount();
    expect(api.unsubscribed).toBe(1);
    const base = calls();
    await settle(120_000);
    expect(calls()).toBe(base);
  });
});

describe("offline", () => {
  it("shows the last data marked as possibly out of date and hides sales that have ended", async () => {
    answer(entry("a", "Fade", 3000), entry("b", "Wash", 3600000));
    mount();
    await settle(100);
    expect(screen.queryByText("Offline: may be out of date")).toBeNull();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    api.list.mockRejectedValue(new Error("offline"));
    act(() => window.dispatchEvent(new Event("offline")));
    await settle(500);
    expect(screen.getByText("Offline: may be out of date")).toBeInTheDocument();
    expect(screen.getByText("Fade")).toBeInTheDocument();
    await settle(3500);
    expect(screen.queryByText("Fade")).toBeNull();
    expect(screen.getByText("Wash")).toBeInTheDocument();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    answer(entry("b", "Wash", 3600000));
    act(() => window.dispatchEvent(new Event("online")));
    await settle(1000);
    expect(screen.queryByText("Offline: may be out of date")).toBeNull();
  });
});
