import test from "node:test";
import assert from "node:assert/strict";
import { countryName, dialCodeOf, flagOf, formatInternational, isValidPhone, listCountries, parsePhone, searchCountries, splitPhone, toE164 } from "./index.js";

test("flags are built from the country code, for any country", () => {
  assert.equal(flagOf("KE"), "🇰🇪");
  assert.equal(flagOf("gb"), "🇬🇧");
  assert.equal(flagOf("JP"), "🇯🇵");
});

test("every country has a name, a flag and a dial code", () => {
  const all = listCountries();
  assert.ok(all.length >= 240, `only ${all.length} countries`);
  for (const c of all) {
    assert.match(c.iso, /^[A-Z]{2}$/);
    assert.ok(c.name && c.name !== c.iso || c.iso === "XK", `no name for ${c.iso}`);
    assert.match(c.dial, /^\+\d{1,4}$/);
    assert.ok(c.flag.length >= 4);
  }
  assert.equal(new Set(all.map((c) => c.iso)).size, all.length);
  assert.equal(countryName("KE"), "Kenya");
  assert.equal(dialCodeOf("KE"), "+254");
  assert.equal(dialCodeOf("US"), "+1");
  assert.equal(dialCodeOf("CA"), "+1");
});

test("search finds a country by name, nickname, ISO code or dial code", () => {
  const first = (q) => searchCountries(q)[0]?.iso;
  assert.equal(first("kenya"), "KE");
  assert.equal(first("KEN"), "KE");
  assert.equal(first("uk"), "GB");
  assert.equal(first("usa"), "US");
  assert.equal(first("uae"), "AE");
  assert.equal(first("ivory"), "CI");
  assert.equal(first("côte"), "CI");
  assert.equal(first("+254"), "KE");
  assert.equal(first("254"), "KE");
  assert.equal(first("+44"), "GB");
  assert.ok(searchCountries("+1").map((c) => c.iso).includes("CA"));
  assert.deepEqual(searchCountries("zzzz"), []);
  assert.equal(searchCountries("").length, listCountries().length);
});

test("people type a number the way they know it, and it becomes one international form", () => {
  const cases = [
    ["0712 345 678", "KE", "+254712345678"],
    ["0712345678", "KE", "+254712345678"],
    ["254712345678", "KE", "+254712345678"],
    ["+254 712 345 678", "KE", "+254712345678"],
    ["0110123456", "KE", "+254110123456"], // Kenya's newer 01xx mobile range
    ["0772 123456", "UG", "+256772123456"],
    ["0712 345 678", "TZ", "+255712345678"],
    ["(415) 555-2671", "US", "+14155552671"],
    ["020 7123 4567", "GB", "+442071234567"],
    ["0151 12345678", "DE", "+4915112345678"],
    ["090-1234-5678", "JP", "+819012345678"],
    ["98765 43210", "IN", "+919876543210"],
    ["00256772123456", "KE", "+256772123456"], // a pasted international number wins over the chosen country
    ["+971 50 123 4567", "KE", "+971501234567"]
  ];
  for (const [typed, country, want] of cases) {
    assert.equal(toE164(typed, country), want, `${typed} in ${country}`);
    assert.equal(isValidPhone(typed, country), true, `${typed} in ${country} should be valid`);
  }
});

test("a number that is not real is not valid, wherever it is from", () => {
  for (const [typed, country] of [["", "KE"], ["0712345", "KE"], ["12345", "UG"], ["abc", "KE"], ["07123456789012", "KE"], ["555", "US"], ["+0123456789", "KE"], ["+1234", "KE"]]) {
    assert.equal(isValidPhone(typed, country), false, `${JSON.stringify(typed)} in ${country}`);
  }
  assert.equal(parsePhone("", "KE"), null);
  assert.equal(parsePhone("   ", "KE"), null);
});

test("a half-typed number is still held as a string, but never valid", () => {
  const p = parsePhone("0712 34", "KE");
  assert.equal(p.valid, false);
  assert.match(p.e164, /^\+254/);
  assert.equal(parsePhone("+2567", "KE").valid, false);
});

test("the country picked is kept when a calling code is shared", () => {
  assert.equal(parsePhone("(604) 555-0123", "CA").country, "CA");
  assert.equal(parsePhone("(415) 555-2671", "US").country, "US");
  assert.equal(parsePhone("+16045550123", "CA").country, "CA");
  assert.equal(parsePhone("+16045550123", "US").country, "US"); // +1 is one code for both: the choice made is kept
  assert.equal(parsePhone("+16045550123", "KE").country, "CA"); // nothing chosen for +1, so it is read from the number
  assert.equal(splitPhone("+16045550123", "KE", "CA").country, "CA");
  assert.equal(splitPhone("+442071234567", "KE", "GG").country, "GG");
});

test("stored values are split back into a country and the number as written there", () => {
  assert.deepEqual(splitPhone("+254712345678"), { country: "KE", text: "0712 345678" });
  assert.deepEqual(splitPhone("+256772123456"), { country: "UG", text: "0772 123456" });
  assert.deepEqual(splitPhone("+14155552671"), { country: "US", text: "(415) 555-2671" });
  assert.deepEqual(splitPhone("0712 345 678"), { country: "KE", text: "0712 345678" }); // an old draft, written the Kenyan way
  assert.deepEqual(splitPhone("0772123456", "UG"), { country: "UG", text: "0772 123456" });
  assert.deepEqual(splitPhone(""), { country: "KE", text: "" });
  assert.deepEqual(splitPhone(undefined, "TZ"), { country: "TZ", text: "" });
  assert.deepEqual(splitPhone("garbage", "UG"), { country: "UG", text: "garbage" });
});

test("numbers are shown internationally", () => {
  assert.equal(formatInternational("+254712345678"), "+254 712 345678");
  assert.equal(formatInternational("+14155552671"), "+1 415 555 2671");
  assert.equal(formatInternational("nope"), "nope");
  assert.equal(formatInternational(null), "");
});
