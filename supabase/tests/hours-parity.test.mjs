import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect } from "./db.mjs";
import { isOpenOn } from "../../shared/src/utils.js";
import { WEEK_DAYS } from "../../shared/src/seller/hours.js";

// The server filter ("open now" search, hours_open_in) and the pages (shared isOpenOn) each carry the rules. This runs the same random shops
// and moments through both and demands the same answer, so a shop never reads open in a search and closed on its page, or the reverse.

let c;
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_hours_parity" })); });
after(async () => { await c.end(); });

const mulberry = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAY = 86_400_000;
const ZONES = ["Africa/Nairobi", "Africa/Lagos", "Europe/London", "Asia/Kolkata", "America/New_York", "Pacific/Auckland"];
const BASE = Date.UTC(2026, 10, 9); // Mon 9 Nov 2026

function makeCase(rand) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const int = (n) => Math.floor(rand() * n);
  const hours = {};
  for (const d of WEEK_DAYS) {
    const r = rand();
    if (r < 0.25) continue;
    if (r < 0.35) hours[d] = ["00:00", "23:59"];
    else if (r < 0.5) hours[d] = [hhmm(18 * 60 + int(6) * 30), hhmm(int(4) * 60)]; // overnight
    else { const s = 6 * 60 + int(8) * 30; hours[d] = [hhmm(s), hhmm(s + 60 + int(10) * 60 > 1439 ? 1439 : s + 60 + int(10) * 60)]; }
  }
  const zone = pick(ZONES);
  const dateOf = (offset) => new Date(BASE + offset * DAY).toISOString().slice(0, 10);
  const exceptions = [];
  const used = new Set();
  const count = int(5);
  for (let i = 0; i < count; i += 1) {
    const offset = int(10);
    const date = dateOf(offset);
    const r = rand();
    if (r < 0.3 && !used.has(date)) { used.add(date); exceptions.push({ id: `e${i}`, date, kind: "closed", intervals: [], note: null }); }
    else if (r < 0.6 && !used.has(date)) {
      used.add(date);
      const s = 7 * 60 + int(6) * 60;
      const overnight = rand() < 0.3;
      exceptions.push({ id: `e${i}`, date, kind: "special", intervals: [[hhmm(s), overnight ? hhmm(int(4) * 60) : hhmm(Math.min(s + 120 + int(5) * 60, 1439))]], note: null });
    } else {
      const s = 9 * 60 + int(6) * 60;
      const e = { id: `e${i}`, date, kind: "break", intervals: [[hhmm(s), hhmm(s + 30 + int(3) * 30)]], note: null };
      if (rand() < 0.5) e.until = dateOf(offset + int(5));
      if (rand() < 0.4) e.weekdays = WEEK_DAYS.filter(() => rand() < 0.5).concat(["mon"]).filter((d, k, a) => a.indexOf(d) === k);
      exceptions.push(e);
    }
  }
  const moments = Array.from({ length: 12 }, () => new Date(BASE + int(12) * DAY + int(24 * 60) * 60_000 - DAY));
  return { hours, exceptions, zone, moments };
}

test("the server's open-now rule and the pages' open-now rule agree on random shops, breaks, specials and zones", async () => {
  const rand = mulberry(20261109);
  const mismatches = [];
  let checked = 0;
  for (let n = 0; n < 400; n += 1) {
    const { hours, exceptions, zone, moments } = makeCase(rand);
    for (const at of moments) {
      const { rows } = await c.query(`select public.hours_open_in($1::jsonb, $2::jsonb, $3::timestamptz, $4) as open`, [JSON.stringify(hours), JSON.stringify(exceptions), at.toISOString(), zone]);
      const js = isOpenOn(hours, exceptions, at, zone);
      checked += 1;
      if (rows[0].open !== js) mismatches.push({ hours, exceptions, zone, at: at.toISOString(), sql: rows[0].open, js });
    }
  }
  assert.ok(checked >= 4800);
  assert.deepEqual(mismatches.slice(0, 3), [], `${mismatches.length} of ${checked} disagree`);
});
