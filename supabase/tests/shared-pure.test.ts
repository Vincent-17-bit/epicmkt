// Pure helpers: dates in EAT, SMS segments, safe-alphabet IDs. Uses node:test so both
// `deno test` and `node --test` (Node 22.18+) run it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addCalendarMonth, addDays, daysLeft, diffDays, isDay, listingState, nairobiDay, nairobiMidnight, renewalPeriod } from "../functions/_shared/dates.ts";
import { countSms, GSM7, toGsmFriendly, UCS2 } from "../functions/_shared/sms.ts";
import { generatePassword, generateReferenceNo, generateSellerId, randomId, REFERENCE_RE, SAFE_ALPHABET, SELLER_ID_RE } from "../functions/_shared/ids.ts";
import { passwordProblems } from "../functions/_shared/synced/password.js";

test("addCalendarMonth clamps to the end of a shorter month", () => {
  assert.equal(addCalendarMonth("2026-01-31"), "2026-02-28");
  assert.equal(addCalendarMonth("2026-01-30"), "2026-02-28");
  assert.equal(addCalendarMonth("2028-01-31"), "2028-02-29"); // leap year
  assert.equal(addCalendarMonth("2026-03-31"), "2026-04-30");
  assert.equal(addCalendarMonth("2026-03-15"), "2026-04-15");
  assert.equal(addCalendarMonth("2026-12-31"), "2027-01-31"); // year rollover
  assert.equal(addCalendarMonth("2026-12-15", 2), "2027-02-15");
  assert.equal(addCalendarMonth("2026-03-31", -1), "2026-02-28");
  assert.equal(addCalendarMonth("2026-02-28"), "2026-03-28"); // clamping is not remembered
});

test("addCalendarMonth uses the EAT day of an instant, not the UTC day", () => {
  // 22:30 UTC on 30 Jan is 01:30 on 31 Jan in Nairobi.
  assert.equal(addCalendarMonth(new Date("2026-01-30T22:30:00Z")), "2026-02-28");
  // 20:59 UTC on 30 Jan is still 30 Jan in Nairobi.
  assert.equal(addCalendarMonth(new Date("2026-01-30T20:59:00Z")), "2026-02-28");
  assert.equal(nairobiDay(new Date("2026-01-30T21:00:00Z")), "2026-01-31");
  assert.equal(nairobiDay(new Date("2026-01-30T20:59:59Z")), "2026-01-30");
});

test("day helpers refuse impossible dates", () => {
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2026-13-01"), false);
  assert.equal(isDay("26-01-01"), false);
  assert.equal(isDay("2028-02-29"), true);
  assert.throws(() => nairobiDay("2026-02-30"));
  assert.throws(() => nairobiDay("not a date"));
  assert.throws(() => addCalendarMonth("2026-01-31", 1.5));
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(diffDays("2026-03-01", "2026-02-01"), 28);
});

test("early renewal continues the paid period; late renewal starts today", () => {
  const now = new Date("2026-10-14T09:00:00+03:00");
  // 6 days left: the new month starts on the paid-until day, no day is lost.
  assert.deepEqual(renewalPeriod("2026-10-20", now), { start: "2026-10-20", end: "2026-11-20", continuesPaidPeriod: true });
  // paid until today: still continues.
  assert.deepEqual(renewalPeriod("2026-10-14", now), { start: "2026-10-14", end: "2026-11-14", continuesPaidPeriod: true });
  // paid until yesterday: inside the grace day, still continues.
  assert.deepEqual(renewalPeriod("2026-10-13", now), { start: "2026-10-13", end: "2026-11-13", continuesPaidPeriod: true });
  // expired two days ago: starts today.
  assert.deepEqual(renewalPeriod("2026-10-12", now), { start: "2026-10-14", end: "2026-11-14", continuesPaidPeriod: false });
  // never paid.
  assert.deepEqual(renewalPeriod(null, now), { start: "2026-10-14", end: "2026-11-14", continuesPaidPeriod: false });
});

test("early renewal on 31 January lands on 28 February, then 28 March", () => {
  const now = new Date("2026-01-20T10:00:00+03:00");
  const first = renewalPeriod("2026-01-31", now);
  assert.equal(first.end, "2026-02-28");
  const second = renewalPeriod(nairobiMidnight(first.end), new Date("2026-02-10T10:00:00+03:00"));
  assert.equal(second.start, "2026-02-28");
  assert.equal(second.end, "2026-03-28");
});

test("listing state: active through the paid day, one day of grace, then expired", () => {
  const paid = nairobiMidnight("2026-10-14");
  assert.equal(listingState(paid, new Date("2026-10-14T23:59:00+03:00")), "active");
  assert.equal(listingState(paid, new Date("2026-10-15T00:00:00+03:00")), "grace");
  assert.equal(listingState(paid, new Date("2026-10-15T23:59:00+03:00")), "grace");
  assert.equal(listingState(paid, new Date("2026-10-16T00:00:00+03:00")), "expired");
  assert.equal(listingState(null), "none");
  assert.equal(daysLeft(paid, new Date("2026-10-10T12:00:00+03:00")), 4);
  assert.equal(daysLeft(undefined), null);
});

test("nairobiMidnight is the start of the day in EAT", () => {
  assert.equal(nairobiMidnight("2026-10-14"), "2026-10-13T21:00:00.000Z");
  assert.equal(nairobiDay(nairobiMidnight("2026-10-14")), "2026-10-14");
});

// ---- SMS --------------------------------------------------------------------------------------

test("SMS: GSM-7 limits are 160 and then 153 per part", () => {
  assert.equal(countSms("").segments, 0);
  const a160 = countSms("a".repeat(160));
  assert.deepEqual([a160.encoding, a160.units, a160.segments, a160.remaining], ["GSM-7", 160, 1, 0]);
  const a161 = countSms("a".repeat(161));
  assert.deepEqual([a161.segments, a161.perSegment, a161.remaining], [2, GSM7.multipart, 153 * 2 - 161]);
  assert.equal(countSms("a".repeat(306)).segments, 2);
  assert.equal(countSms("a".repeat(307)).segments, 3);
});

test("SMS: extension characters cost two septets", () => {
  assert.equal(countSms("€").units, 2);
  assert.equal(countSms("[x]").units, 5);
  assert.equal(countSms("€".repeat(80)).segments, 1); // 160 septets
  assert.equal(countSms("€".repeat(81)).segments, 2);
  // An escape pair is never split: 152 plain + one euro would need 154 in the first part.
  const info = countSms("a".repeat(152) + "€" + "a".repeat(10));
  assert.equal(info.units, 164);
  assert.equal(info.segments, 2);
});

test("SMS: GSM-7 accents and the basic table stay GSM-7", () => {
  const info = countSms("Habari! Bei ni KES 1,500 @ duka. Café à ñ ü £ $ ¥ § ¿ ¡ Ø å Δ Ω\nOK");
  assert.equal(info.encoding, "GSM-7");
  assert.deepEqual(info.unicodeChars, []);
});

test("SMS: one non-GSM character flips the message to UCS-2 (70 then 67)", () => {
  assert.equal(countSms("ś".repeat(70)).segments, 1);
  assert.equal(countSms("ś".repeat(70)).encoding, "UCS-2");
  const long = countSms("ś".repeat(71));
  assert.deepEqual([long.segments, long.perSegment], [2, UCS2.multipart]);
  assert.equal(countSms("ś".repeat(134)).segments, 2);
  assert.equal(countSms("ś".repeat(135)).segments, 3);
  const quote = countSms("It’s done"); // curly apostrophe
  assert.equal(quote.encoding, "UCS-2");
  assert.deepEqual(quote.unicodeChars, ["’"]);
});

test("SMS: an emoji is two UTF-16 units and is never split across parts", () => {
  assert.equal(countSms("😀").units, 2);
  assert.equal(countSms("😀".repeat(35)).segments, 1); // 70 units
  assert.equal(countSms("😀".repeat(36)).segments, 2);
  // 134 units would be 2 parts if split anywhere, but the emoji does not fit after 66 units, so it starts part 2.
  const info = countSms("ś".repeat(66) + "😀" + "ś".repeat(66));
  assert.equal(info.units, 134);
  assert.equal(info.segments, 3);
  assert.equal(info.characters, 133);
});

test("SMS: toGsmFriendly turns smart punctuation back into GSM-7", () => {
  const fixed = toGsmFriendly("“Renew” – it’s 5 days… ok");
  assert.equal(fixed, "\"Renew\" - it's 5 days... ok");
  assert.equal(countSms(fixed).encoding, "GSM-7");
});

// ---- IDs --------------------------------------------------------------------------------------

test("safe alphabet has 32 unambiguous characters", () => {
  assert.equal(SAFE_ALPHABET.length, 32);
  assert.equal(new Set(SAFE_ALPHABET).size, 32);
  for (const bad of "01IO") assert.ok(!SAFE_ALPHABET.includes(bad), bad);
});

test("randomId: right length, only alphabet characters, no duplicates in a large sample", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const id = randomId(10);
    assert.equal(id.length, 10);
    assert.match(id, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    seen.add(id);
  }
  assert.equal(seen.size, 2000);
});

test("randomId is unbiased: bytes above the largest multiple are rejected", () => {
  // 10-character alphabet: 256 - 256 % 10 = 250, so bytes 250..255 must be skipped.
  const bytes = () => Uint8Array.from([255, 254, 253, 252, 251, 250, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(randomId(10, "0123456789", bytes), "0123456789");
});

test("randomId covers every character roughly evenly", () => {
  const counts = new Map<string, number>();
  for (let i = 0; i < 125; i++) for (const c of randomId(256)) counts.set(c, (counts.get(c) ?? 0) + 1);
  assert.equal(counts.size, 32);
  for (const n of counts.values()) assert.ok(n > 800 && n < 1200, `count ${n} is out of range`);
});

test("randomId rejects bad arguments and a dead random source", () => {
  assert.throws(() => randomId(0));
  assert.throws(() => randomId(5, "a"));
  assert.throws(() => randomId(5, "aab"));
  assert.throws(() => randomId(5, "abc", () => new Uint8Array(16).fill(255)));
});

test("reference numbers, seller IDs and generated passwords have the expected shape", () => {
  assert.match(generateReferenceNo(new Date("2026-10-14T00:00:00Z")), REFERENCE_RE);
  assert.ok(generateReferenceNo(new Date("2026-12-31T22:00:00Z")).startsWith("EPM-2027-")); // already 2027 in Nairobi
  for (let i = 0; i < 500; i++) assert.match(generateSellerId(), SELLER_ID_RE);
  for (let i = 0; i < 200; i++) {
    const p = generatePassword({ sellerId: "ES123456", phone: "+254712345678" });
    assert.equal(p.length, 14);
    assert.deepEqual(passwordProblems(p, { sellerId: "ES123456", phone: "+254712345678" }), []);
    assert.ok(!/[01IOl]/.test(p));
  }
});
