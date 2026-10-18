import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOUR = 3600000;
const REAL = Date.parse("2026-10-17T12:00:00.000Z");

const server = vi.hoisted(() => ({ respond: () => ({ now: new Date().toISOString() }), calls: 0 }));
vi.mock("../api/index.js", () => ({
  getServerTime: vi.fn(async () => {
    server.calls += 1;
    return server.respond();
  })
}));

let clock;
let skew = 0;

const serverClock = ({ rttMs = 0, serverSkew = 0 } = {}) => () => {
  const sentAt = Date.now();
  vi.setSystemTime(sentAt + rttMs / 2);
  const reading = Date.now() - skew + serverSkew;
  vi.setSystemTime(sentAt + rttMs);
  return { now: new Date(reading).toISOString() };
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  server.calls = 0;
  clock = await import("./clock.js");
});

afterEach(() => {
  vi.useRealTimers();
});

const withDeviceSkew = (ms) => {
  skew = ms;
  vi.setSystemTime(REAL + ms);
  server.respond = serverClock();
};

describe("server clock", () => {
  it("is not synced until the server answers, and falls back to the device clock", () => {
    vi.setSystemTime(REAL);
    expect(clock.isSynced()).toBe(false);
    expect(clock.serverNow()).toBe(REAL);
  });

  it.each([
    ["2 hours ahead", 2 * HOUR],
    ["2 hours behind", -2 * HOUR]
  ])("a device %s shows the same remaining time as the server", async (_label, ms) => {
    withDeviceSkew(ms);
    await clock.syncServerTime();
    expect(clock.isSynced()).toBe(true);
    const endsAt = REAL + 3 * HOUR;
    expect(endsAt - clock.serverNow()).toBe(3 * HOUR);
    vi.setSystemTime(Date.now() + 90 * 60000);
    expect(endsAt - clock.serverNow()).toBe(90 * 60000);
  });

  it("devices with opposite wrong clocks agree to the millisecond", async () => {
    withDeviceSkew(2 * HOUR);
    await clock.syncServerTime();
    const ahead = clock.serverNow() - Date.now();
    vi.resetModules();
    clock = await import("./clock.js");
    withDeviceSkew(-2 * HOUR);
    await clock.syncServerTime();
    const behind = clock.serverNow() - Date.now();
    expect(ahead).toBe(-2 * HOUR);
    expect(behind).toBe(2 * HOUR);
  });

  it("compensates for the round trip", async () => {
    skew = 0;
    vi.setSystemTime(REAL);
    server.respond = serverClock({ rttMs: 1000 });
    await clock.syncServerTime();
    expect(clock.clockOffset()).toBe(0);
    expect(Math.abs(clock.serverNow() - Date.now())).toBeLessThanOrEqual(1);
  });

  it("ignores a very slow sample once synced", async () => {
    withDeviceSkew(HOUR);
    await clock.syncServerTime();
    const good = clock.clockOffset();
    server.respond = serverClock({ rttMs: 9000, serverSkew: 5 * HOUR });
    await clock.syncServerTime();
    expect(clock.clockOffset()).toBe(good);
  });

  it("shares one request between simultaneous syncs and survives a failure", async () => {
    withDeviceSkew(0);
    await Promise.all([clock.syncServerTime(), clock.syncServerTime(), clock.syncServerTime()]);
    expect(server.calls).toBe(1);
    server.respond = () => {
      throw new Error("offline");
    };
    await expect(clock.syncServerTime()).resolves.toBeUndefined();
    expect(clock.isSynced()).toBe(true);
  });

  it("stays unsynced when the first request fails", async () => {
    server.respond = () => {
      throw new Error("offline");
    };
    await clock.syncServerTime();
    expect(clock.isSynced()).toBe(false);
  });

  it("recomputes from the absolute time after the tab sleeps", async () => {
    withDeviceSkew(0);
    await clock.syncServerTime();
    const listener = vi.fn();
    const stop = clock.subscribe(listener);
    const before = clock.getSnapshot();
    vi.setSystemTime(Date.now() + 10 * 60000);
    expect(clock.getSnapshot()).toBe(before);
    for (const [target, name] of [[document, "visibilitychange"], [window, "pageshow"], [window, "focus"]]) {
      listener.mockClear();
      vi.setSystemTime(Date.now() + 1000);
      target.dispatchEvent(new Event(name));
      expect(listener).toHaveBeenCalled();
      expect(clock.getSnapshot()).toBe(Math.floor(clock.serverNow() / 1000) * 1000);
    }
    stop();
  });

  it("uses one shared timer for any number of listeners", () => {
    vi.setSystemTime(REAL);
    const spy = vi.spyOn(window, "setTimeout");
    const stops = Array.from({ length: 50 }, () => clock.subscribe(() => {}));
    expect(spy).toHaveBeenCalledTimes(1);
    stops.forEach((stop) => stop());
    expect(vi.getTimerCount()).toBe(0);
  });
});
