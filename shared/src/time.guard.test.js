import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Keeps the time zone contract (shared/src/time.js) from eroding. Every rule below is a way code goes wrong for people
// outside Nairobi, or for everyone on the two days a year clocks change.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const APPS = ["client/src", "client/api", "seller/src", "admin/src", "ui/src", "shared/src", "backend/src", "admin-backend/src", "supabase/functions"];

const isTestOrFixture = (path) => /\.test\.|\.snap-test\.|[\\/]test[\\/]|[\\/]tests[\\/]|mock|fake|seed|fixture/i.test(path);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) yield* walk(path);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(name)) yield path;
  }
}

const files = APPS.flatMap((app) => {
  try {
    return [...walk(join(root, app))];
  } catch {
    return [];
  }
}).filter((f) => !isTestOrFixture(relative(root, f)));

// The only places allowed to know the business zone or do raw zone maths.
const ALLOW = {
  "shared/src/time.js": "the time module itself",
  "supabase/functions/_shared/synced/time.js": "byte for byte copy of shared/src/time.js (npm run sync:shared)",
};

const RULES = [
  { name: "a hard coded Nairobi zone (use BUSINESS_TIME_ZONE, or the viewer's zone for an instant)", re: /Africa\/Nairobi/ },
  { name: "a hand written +03:00 offset (use zonedTimeToUtc / localInputToUtcIso)", re: /["'`][^"'`\n]*[+]03:?00["'`]/ },
  { name: "a fixed 3 hour shift (use zonedParts / businessDay)", re: /[+]\s*3\s*\*\s*3_?600_?000|[+]\s*TIMEZONE_OFFSET_HOURS/ },
// api.setHours / impl.setHours is the seller API call that saves a week of opening hours, not a Date method.
  { name: "a device zone getter, which returns a different answer for every user (use zonedParts)", re: /(?<!\b(?:api|impl))\.(getHours|getMinutes|getSeconds|getDate|getDay|getMonth|getTimezoneOffset|setHours|setMinutes|setDate|setMonth)\s*\(/ },
  { name: "toLocaleDateString/toLocaleTimeString with no zone (use formatInstant)", re: /\.toLocale(Date|Time)String\s*\((?![^)]*timeZone)/ },
  { name: "Intl.DateTimeFormat with no timeZone (use formatInstant)", re: /new Intl\.DateTimeFormat\s*\((?![^)]*timeZone)[^)]*\)\s*\.format/ },
  // "2026-10-25T04:00:00" with no Z or offset is read in the DEVICE zone by new Date().
  { name: "new Date() on a date-time string with no Z or offset (it is read in the device zone)", re: /new Date\(\s*[`"'][^`"'\n]*\d\d:\d\d(?::\d\d)?[`"']\s*\)/ },
];

test("the scan sees the production source it is meant to guard", () => {
  assert.ok(files.length > 100, `only found ${files.length} files`);
  for (const must of ["shared/src/time.js", "seller/src/pages/business/Flash.jsx", "admin/src/lib/time.js", "client/src/lib/flash.js"]) {
    assert.ok(files.some((f) => relative(root, f).replaceAll("\\", "/") === must), `missing ${must}`);
  }
});

for (const rule of RULES) {
  test(`production code has no ${rule.name}`, () => {
    const hits = [];
    for (const file of files) {
      const rel = relative(root, file).replaceAll("\\", "/");
      if (ALLOW[rel]) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        if (rule.re.test(code)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 140)}`);
      });
    }
    assert.deepEqual(hits, [], `\n${hits.join("\n")}\n`);
  });
}

test("every allowlist entry still exists and still needs its exemption", () => {
  for (const path of Object.keys(ALLOW)) {
    const text = readFileSync(join(root, path), "utf8");
    assert.ok(/Africa\/Nairobi|[+]\s*3\s*\*\s*3_?600|[+]03/.test(text), `${path} no longer needs an allowlist entry; remove it`);
  }
});
