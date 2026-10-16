import { test } from "node:test";
import assert from "node:assert/strict";
import { SLA_FILTERS, SLA_HOURS, SLA_WARN_HOURS, slaCutoffs, slaState } from "./sla.js";

const NOW = new Date("2026-10-15T12:00:00Z");
const ago = (hours, minutes = 0) => new Date(NOW.getTime() - (hours * 60 + minutes) * 60_000).toISOString();

test("the SLA is 24 hours with a warning from 18", () => {
  assert.equal(SLA_HOURS, 24);
  assert.equal(SLA_WARN_HOURS, 18);
});

test("a waiting application is on time, due soon, or overdue, with the time left or over", () => {
  assert.deepEqual(
    (({ state, label, detail, tone }) => ({ state, label, detail, tone }))(slaState({ status: "submitted", submitted_at: ago(3, 40) }, NOW)),
    { state: "ok", label: "On time", detail: "20 h 20 min left", tone: "success" },
  );
  assert.equal(slaState({ status: "submitted", submitted_at: ago(17, 59) }, NOW).state, "ok");
  assert.equal(slaState({ status: "submitted", submitted_at: ago(18) }, NOW).state, "soon");
  assert.equal(slaState({ status: "submitted", submitted_at: ago(23, 30) }, NOW).detail, "30 min left");
  assert.equal(slaState({ status: "submitted", submitted_at: ago(24) }, NOW).state, "breached");
  const late = slaState({ status: "submitted", submitted_at: ago(27) }, NOW);
  assert.deepEqual([late.state, late.label, late.detail, late.tone, late.progress], ["breached", "Overdue", "3 h over", "danger", 1]);
});

test("progress runs from 0 to 1 over the 24 hours", () => {
  assert.equal(slaState({ status: "submitted", submitted_at: ago(0) }, NOW).progress, 0);
  assert.equal(slaState({ status: "submitted", submitted_at: ago(12) }, NOW).progress, 0.5);
  assert.equal(slaState({ status: "submitted", submitted_at: ago(100) }, NOW).progress, 1);
});

test("a clock in the future (skewed browser time) never goes negative", () => {
  const s = slaState({ status: "submitted", submitted_at: new Date(NOW.getTime() + 5 * 60_000).toISOString() }, NOW);
  assert.equal(s.state, "ok");
  assert.equal(s.elapsedMs, 0);
});

test("under review: met or missed, from when the review started", () => {
  const met = slaState({ status: "under_review", submitted_at: ago(30), review_started_at: ago(10) }, NOW); // picked up after 20 h
  assert.deepEqual([met.state, met.label, met.detail], ["met", "Met", "Picked up after 20 h"]);
  const missed = slaState({ status: "under_review", submitted_at: ago(60), review_started_at: ago(10) }, NOW); // after 50 h
  assert.deepEqual([missed.state, missed.tone], ["missed", "danger"]);
});

test("no SLA when there is no timestamp or the application is past review", () => {
  assert.equal(slaState({ status: "submitted", submitted_at: null }, NOW).state, "none");
  assert.equal(slaState({ status: "submitted", submitted_at: "not a date" }, NOW).state, "none");
  assert.equal(slaState({ status: "approved", submitted_at: ago(5) }, NOW).state, "none");
  assert.equal(slaState({ status: "under_review", submitted_at: ago(5) }, NOW).state, "none"); // no review_started_at
  assert.equal(slaState(null, NOW).state, "none");
});

test("filter cut-offs line up with the states", () => {
  const { breach, warn } = slaCutoffs(NOW);
  assert.equal(breach, ago(24));
  assert.equal(warn, ago(18));
  assert.deepEqual(SLA_FILTERS.map((f) => f.id), ["breached", "soon", "ok"]);
});
