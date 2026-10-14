import nodeAssert from "node:assert/strict";
import { addCalendarMonth, eatToday, formatDay, laterDate, nairobiDay, nairobiMidnight } from "../functions/_shared/dates.ts";
import { SELLER_ID_RE, generateSellerId, makeTempPassword, slugBase, uniqueSlug } from "../functions/_shared/ids.ts";
import { passwordProblems } from "../functions/_shared/synced/password.js";
import { rateLimit } from "../functions/_shared/rateLimit.ts";
import { deps, world } from "./admin-world.ts";

const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepStrictEqual(a, b);

Deno.test("addCalendarMonth: clamps to month end and rolls the year", () => {
  assertEquals(addCalendarMonth("2026-01-31"), "2026-02-28");
  assertEquals(addCalendarMonth("2028-01-31"), "2028-02-29");
  assertEquals(addCalendarMonth("2026-12-15"), "2027-01-15");
  assertEquals(addCalendarMonth("2026-10-14"), "2026-11-14");
  assertEquals(addCalendarMonth("2026-01-31", 2), "2026-03-31");
  assertEquals(addCalendarMonth("2026-11-30", 3), "2027-02-28");
  assertEquals(addCalendarMonth("2026-03-31", 12), "2027-03-31");
  nodeAssert.throws(() => addCalendarMonth("14/10/2026"));
});

Deno.test("eatToday uses Africa/Nairobi, laterDate picks the later ISO date", () => {
  assertEquals(eatToday(new Date("2026-10-14T20:59:00Z")), "2026-10-14");
  assertEquals(eatToday(new Date("2026-10-14T21:00:00Z")), "2026-10-15");
  assertEquals(laterDate("2026-10-14", "2026-11-01"), "2026-11-01");
  assertEquals(laterDate("2026-12-01", "2026-11-01"), "2026-12-01");
});

Deno.test("seller id and temporary password follow the remote rules", () => {
  for (let i = 0; i < 200; i++) {
    nodeAssert.match(generateSellerId(), SELLER_ID_RE);
    const p = makeTempPassword();
    assertEquals(p.length, 12);
    assertEquals(passwordProblems(p, {}), []);
  }
  nodeAssert.notStrictEqual(makeTempPassword(), makeTempPassword());
});

Deno.test("slugBase: ascii, hyphenated, valid length", () => {
  assertEquals(slugBase("Mama Pima's Salon & Spa!"), "mama-pima-s-salon-spa");
  assertEquals(slugBase("Café Déjà Vu"), "cafe-deja-vu");
  assertEquals(slugBase("AB"), "ab-shop");
  assertEquals(slugBase("!!!"), "shop");
  const long = slugBase("x".repeat(200));
  nodeAssert.ok(long.length <= 50);
  nodeAssert.match(slugBase("Any Name"), /^[a-z0-9-]{3,60}$/);
});

Deno.test("uniqueSlug: suffixes -2, -3 on clashes", async () => {
  const taken = new Set(["mama-pima", "mama-pima-2"]);
  assertEquals(await uniqueSlug("Mama Pima", (s) => Promise.resolve(taken.has(s))), "mama-pima-3");
  assertEquals(await uniqueSlug("Fresh Shop", (s) => Promise.resolve(taken.has(s))), "fresh-shop");
  assertEquals(await uniqueSlug("Mama Pima", (s) => Promise.resolve(s === "mama-pima")), "mama-pima-2");
});

Deno.test("rateLimit: allows up to max then blocks", async () => {
  const d = deps(world());
  const results: boolean[] = [];
  for (let i = 0; i < 4; i++) results.push(await rateLimit(d.db, "k", 3, 60));
  assertEquals(results, [true, true, true, false]);
  assertEquals(await rateLimit(d.db, "other", 3, 60), true);
});

Deno.test("nairobiMidnight and nairobiDay round-trip a Nairobi calendar day", () => {
  assertEquals(nairobiMidnight("2026-11-14"), "2026-11-13T21:00:00.000Z");
  assertEquals(nairobiDay("2026-11-13T21:00:00.000Z"), "2026-11-14");
  assertEquals(nairobiDay("2026-11-14T20:59:59.000Z"), "2026-11-14");
  assertEquals(nairobiDay(nairobiMidnight("2027-02-28")), "2027-02-28");
  nodeAssert.throws(() => nairobiMidnight("nope"));
});

Deno.test("formatDay renders DD Mon YYYY", () => {
  assertEquals(formatDay("2026-12-20"), "20 Dec 2026");
  assertEquals(formatDay("2027-02-05"), "05 Feb 2027");
});
