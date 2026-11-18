import { test } from "node:test";
import assert from "node:assert/strict";
import { colourHexOf, colourOf, isColourNamedAxis } from "./colourNames.js";
import { GUIDE_KINDS, GUIDE_LIMITS, GUIDE_TEMPLATES, startGuide } from "./sizeGuide.js";

test("a colour name gives a swatch: one colour, two colours split, Swahili names, and nothing for other words", () => {
  assert.equal(colourOf("Black"), "#111111");
  assert.equal(colourOf("Space Grey"), "#5f6368");
  assert.equal(colourOf("Nyekundu"), "#d32f2f");
  assert.match(colourOf("Black/Red"), /^linear-gradient\(135deg, #111111 50%, #d32f2f 50%\)$/);
  assert.match(colourOf("Multicolour"), /^conic-gradient/);
  assert.equal(colourOf("Festive"), "");
  assert.equal(colourHexOf("Navy blue"), "#1f2a44");
  assert.equal(colourHexOf("Black and white"), "", "two colours have no single hex");
  assert.equal(isColourNamedAxis({ label: "Colour" }), true);
  assert.equal(isColourNamedAxis({ label: "Rangi" }), true);
  assert.equal(isColourNamedAxis({ label: "Weight" }), false);
});

test("size guide templates cover every kind, fit the database, and start from example rows when the item has no sizes", () => {
  for (const k of GUIDE_KINDS) assert.ok(GUIDE_TEMPLATES.some((t) => t.kind === k.id), k.id);
  for (const t of GUIDE_TEMPLATES) {
    assert.equal(t.columns[0], "Size", t.id);
    assert.ok(t.columns.length <= GUIDE_LIMITS.columns && t.columns.every((c) => c.length <= GUIDE_LIMITS.header), t.id);
    for (const r of t.rows ?? []) assert.ok(r.length <= t.columns.length && r.every((c) => String(c).length <= GUIDE_LIMITS.cell), `${t.id} ${r[0]}`);
  }
  const beds = GUIDE_TEMPLATES.find((t) => t.id === "beds");
  assert.deepEqual(startGuide({ ...beds, sizes: ["Standard"] }).rows.map((r) => r.cells[0]), ["3x6", "3.5x6", "4x6", "5x6 (Queen)", "6x6 (King)"]);
  const women = GUIDE_TEMPLATES.find((t) => t.id === "women-intl");
  const mine = startGuide({ ...women, sizes: ["M", "Custom"] }).rows.map((r) => r.cells);
  assert.deepEqual(mine[0].slice(0, 4), ["M", "8-10", "12-14", "40-42"], "a size the template knows brings its numbers");
  assert.deepEqual(mine[1], ["Custom", "", "", "", "", "", ""]);
  const loaf = GUIDE_TEMPLATES.find((t) => t.id === "loaf");
  assert.deepEqual(startGuide({ ...loaf, sizes: ["400g", "900g"] }).rows.map((r) => r.cells.slice(0, 2)), [["400g", "400"], ["900g", "900"]]);
});
