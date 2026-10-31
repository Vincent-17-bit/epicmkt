import { describe, it } from "node:test";
import assert from "node:assert/strict";

// main runs shared tests with node:test, so the few matchers this file uses are mapped onto node:assert.
const expect = (actual) => {
  const m = {
    toBe: (v) => assert.equal(actual, v),
    toEqual: (v) => assert.deepEqual(actual, v),
    toBeNull: () => assert.equal(actual, null),
    toBeGreaterThan: (v) => assert.ok(actual > v, `${actual} is not greater than ${v}`),
    toContain: (v) => assert.ok(actual.includes(v), `${JSON.stringify(actual)} does not contain ${JSON.stringify(v)}`),
    toMatchObject: (v) => { for (const k of Object.keys(v)) assert.deepEqual(actual[k], v[k]); },
  };
  m.not = { toContain: (v) => assert.ok(!actual.includes(v), `${JSON.stringify(actual)} contains ${JSON.stringify(v)}`) };
  return m;
};
import {
  CRITICAL_EVENTS,
  DEFAULT_GREETING,
  DEFAULT_SETTINGS,
  NOTIFICATION_EVENTS,
  applySettingsPatch,
  deliveryDecision,
  describeDevice,
  greetingFor,
  greetingProblems,
  renderGreeting,
  resolveSettings,
  summarizeLogins
} from "./settings.js";

// Nairobi is UTC+3, so 21:30 Nairobi is 18:30 UTC.
const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 11, h - 3, m));

describe("resolveSettings", () => {
  it("returns defaults for missing, null or junk input", () => {
    for (const raw of [undefined, null, {}, "x", 5, [], { appearance: "dark" }]) {
      expect(resolveSettings(raw)).toEqual(resolveSettings({}));
    }
    expect("idle_minutes" in resolveSettings({})).toBe(false);
    expect(resolveSettings({}).appearance.theme).toBe("system");
  });

  it("keeps valid values and replaces invalid ones one by one", () => {
    const s = resolveSettings({ appearance: { theme: "dark", text_size: "huge", density: "compact" }, catalog: { price_reminder_days: 45, low_stock_threshold: 9 } });
    expect(s.appearance).toMatchObject({ theme: "dark", text_size: "normal", density: "compact" });
    expect(s.catalog.price_reminder_days).toBe(30);
    expect(s.catalog.low_stock_threshold).toBe(9);
  });

  it("never lets a critical event turn in-app off", () => {
    const off = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, { in_app: false, sms: false, email: false }]));
    const s = resolveSettings({ notifications: { events: off } });
    for (const key of CRITICAL_EVENTS) expect(s.notifications.events[key].in_app).toBe(true);
    expect(s.notifications.events.customer_report.in_app).toBe(false);
  });

  it("has no language setting", () => {
    expect(JSON.stringify(DEFAULT_SETTINGS).toLowerCase()).not.toContain("language");
    expect(Object.keys(resolveSettings({ language: "sw", appearance: { language: "sw" } }))).not.toContain("language");
  });

  it("repairs bad closure reasons", () => {
    const s = resolveSettings({ messaging: { closure_reasons: [{ id: "a", label: "", message: "x" }, { id: "b", label: "Call 0712345678", message: "" }] } });
    expect(s.messaging.closure_reasons.length).toBeGreaterThan(0);
    expect(s.messaging.closure_reasons.some((r) => r.id === "b")).toBe(false);
  });

  it("merges patches without losing sibling values", () => {
    const next = applySettingsPatch({ appearance: { theme: "dark" } }, { appearance: { density: "compact" } });
    expect(next.appearance).toMatchObject({ theme: "dark", density: "compact" });
  });
});

describe("greeting", () => {
  it("accepts the default and variable use", () => {
    expect(greetingProblems(DEFAULT_GREETING)).toEqual([]);
    expect(renderGreeting("Hi, is {item} at {price} ready?", { item: "Fade cut", price: "KES 300" })).toBe("Hi, is Fade cut at KES 300 ready?");
  });

  it("rejects links, phone-like digit runs, unknown variables, empty and long text", () => {
    expect(greetingProblems("See https://x.com")).toContain("has_link");
    expect(greetingProblems("Visit www.shop.co.ke")).toContain("has_link");
    expect(greetingProblems("wa.me/254712345678")).toContain("has_link");
    expect(greetingProblems("Call 0712 345 678")).toContain("has_phone");
    expect(greetingProblems("Call +254-712-345-678")).toContain("has_phone");
    expect(greetingProblems("Call 07 12 34 56 78 now")).toContain("has_phone");
    expect(greetingProblems("Hi {name}")).toContain("unknown_variable");
    expect(greetingProblems("   ")).toContain("empty");
    expect(greetingProblems("a".repeat(161))).toContain("too_long");
  });

  it("allows short numbers such as prices and quantities", () => {
    expect(greetingProblems("Do you have 2 left for 500?")).toEqual([]);
  });

  it("falls back to the default when the saved greeting is invalid", () => {
    expect(greetingFor({ messaging: { whatsapp_greeting: "Call 0712345678" } }, { item: "Cut", price: "KES 1" })).toBe(renderGreeting(DEFAULT_GREETING, { item: "Cut", price: "KES 1" }));
    expect(greetingFor({ messaging: { whatsapp_greeting: "Hello about {item}" } }, { item: "Cut" })).toBe("Hello about Cut");
  });
});

describe("deliveryDecision", () => {
  const night = at(22, 0);
  const day = at(12, 0);

  it("never holds a text back by the time of day", () => {
    expect(deliveryDecision({ event: "customer_report", channel: "sms", settings: { notifications: { events: { customer_report: { sms: true } } } }, now: night }).action).toBe("send");
    expect(deliveryDecision({ event: "change_decision", channel: "sms", now: night }).action).toBe("send");
    expect(deliveryDecision({ event: "change_decision", channel: "sms", now: day }).action).toBe("send");
    expect(deliveryDecision({ event: "change_decision", channel: "email", settings: { notifications: { events: { change_decision: { email: true } } } }, now: night }).action).toBe("send");
    expect(deliveryDecision({ event: "change_decision", channel: "in_app", now: night }).action).toBe("send");
  });

  it("sends critical and transactional SMS at any hour", () => {
    for (const event of CRITICAL_EVENTS) expect(deliveryDecision({ event, channel: "sms", now: night }).action).toBe("send");
    expect(deliveryDecision({ event: "removal", channel: "sms", kind: "transactional", now: night }).action).toBe("send");
    expect(deliveryDecision({ event: "removal", channel: "sms", kind: "critical", now: night }).action).toBe("send");
  });

  it("skips disabled channels but still delivers critical in-app", () => {
    const events = Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.key, { in_app: false, sms: false, email: false }]));
    for (const key of CRITICAL_EVENTS) expect(deliveryDecision({ event: key, channel: "in_app", settings: { notifications: { events } }, now: day }).action).toBe("send");
    expect(deliveryDecision({ event: "expiry", channel: "sms", settings: { notifications: { events } }, now: day }).action).toBe("skip");
    expect(deliveryDecision({ event: "removal", channel: "in_app", settings: { notifications: { events } }, now: day }).action).toBe("skip");
  });
});

describe("login history", () => {
  const e = (id, minute, success, user_agent = "") => ({ id, created_at: new Date(Date.UTC(2026, 9, 11, 9, minute)).toISOString(), success, user_agent });

  it("counts failed attempts since the previous success", () => {
    const out = summarizeLogins([e(5, 50, true), e(4, 40, false), e(3, 30, false), e(2, 20, true), e(1, 10, false)]);
    expect(out.rows.map((r) => [r.id, r.failedBefore])).toEqual([[5, 2], [4, 0], [3, 0], [2, 1], [1, 0]]);
    expect(out.failedSinceLastSuccess).toBe(0);
  });

  it("reports failures since the last success", () => {
    expect(summarizeLogins([e(3, 30, false), e(2, 20, false), e(1, 10, true)]).failedSinceLastSuccess).toBe(2);
  });

  it("describes devices", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari/537")).toBe("Chrome on Android");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/604")).toBe("Safari on iOS");
    expect(describeDevice("")).toBe("Unknown device");
  });
});
