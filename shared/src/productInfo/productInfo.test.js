import test from "node:test";
import assert from "node:assert/strict";
import { INFO_TEMPLATES, buildInfoGroups, infoGroupKey, infoTemplateOf, infoValueRaw, infoValueText, isInfoGroup, plainSpecs } from "./index.js";
import { cleanSpecs } from "../seller/itemForm.js";

const speaker = INFO_TEMPLATES[0];
const power = speaker.groups.find((g) => g.name === "Power");

test("group keys are marked and fit the database limit", () => {
  for (const g of speaker.groups) assert.ok(infoGroupKey(g.name).length <= 40);
  assert.ok(isInfoGroup(infoGroupKey("Power")));
  assert.ok(!isInfoGroup("Measurements"));
});

test("values keep their unit and read back", () => {
  const row = power.rows[0];
  assert.equal(infoValueText(row, "80"), "80 watts");
  assert.equal(infoValueRaw(row, "80 watts"), "80");
});

test("groups come out in template order and plain rows stay apart", () => {
  const specs = [
    { group: infoGroupKey("Connectivity"), label: "Subwoofer connectivity technology", value: "Wired" },
    { group: infoGroupKey("Power"), label: "Speaker maximum output power", value: "80 watts" },
    { group: "Features & Specs", label: "Colour", value: "Black" }
  ];
  assert.deepEqual(buildInfoGroups(specs).map((g) => g.name), ["Power", "Connectivity"]);
  assert.equal(infoTemplateOf(specs).id, "speaker");
  assert.equal(plainSpecs(specs).length, 1);
});

test("cleanSpecs accepts info groups and a full sheet", () => {
  const rows = speaker.groups.flatMap((g) => g.rows.map((r) => ({ group: infoGroupKey(g.name), label: r.label, value: "x" })));
  const out = cleanSpecs(rows);
  assert.deepEqual(out.errors, {});
  assert.equal(out.specs.length, rows.length);
});

import { FAQ_GROUP, buildFaqs, faqRows, isTemplateGroup } from "./index.js";

test("FAQs use long limits and stay out of the info table", () => {
  const long = { group: FAQ_GROUP, label: "q".repeat(150), value: "a".repeat(500) };
  const out = cleanSpecs([long, { group: infoGroupKey("Power"), label: "Voltage", value: "5 volts" }]);
  assert.deepEqual(out.errors, {});
  assert.equal(out.specs.length, 2);
  assert.equal(cleanSpecs([{ group: "Features & Specs", label: "q".repeat(150), value: "a" }]).errors[0].label.includes("100"), true);
  assert.equal(buildFaqs(out.specs).length, 1);
  assert.equal(faqRows(out.specs)[0].answer.length, 500);
  assert.deepEqual(buildInfoGroups(out.specs).map((g) => g.name), ["Power"]);
  assert.equal(isTemplateGroup(FAQ_GROUP), false);
});

test("every template group fits the database limits", () => {
  for (const t of INFO_TEMPLATES) for (const g of t.groups) for (const r of g.rows) assert.ok(r.label.length <= 40, `${t.id}/${r.label}`);
});

import { suggestInfoTemplate } from "./index.js";

test("templates are suggested per item and carry no unrelated groups", () => {
  const cases = [
    [{ category: "Water refill station", name: "20L refill" }, "water-point"],
    [{ category: "Printing and stationery", name: "Custom shirt printing" }, "custom-printing"],
    [{ category: "Bakery", name: "Chocolate chip cookies" }, "bakery-item"],
    [{ category: "Supermarket or minimart", name: "Msafi washing powder 1kg" }, "packaged-goods"],
    [{ category: "Electronics and appliances", typeId: "phone", name: "Tecno Spark 10" }, "phone"],
    [{ category: "Electronics and appliances", name: "JBL Bluetooth speaker" }, "speaker"],
    [{ category: "Hardware and building supplies", name: "Cement" }, "general-product"]
  ];
  for (const [input, id] of cases) assert.equal(suggestInfoTemplate(input), id, input.name);
  const unrelated = ["Compatibility", "Power Source", "Audio Hardware", "Sound Quality", "Measurements"];
  for (const id of ["water-point", "custom-printing", "bakery-item", "packaged-goods", "phone"]) {
    const names = INFO_TEMPLATES.find((t) => t.id === id).groups.map((g) => g.name);
    for (const bad of unrelated) assert.ok(!names.includes(bad), `${id} has ${bad}`);
  }
});

test("brand story: builds blocks, skips blanks, stays out of the table", async () => {
  const { buildBrandStory, BRAND_GROUP, specLimitsFor, isTemplateGroup } = await import("./index.js");
  const specs = [
    { group: BRAND_GROUP, label: "Built to last", value: "Strong body." },
    { group: BRAND_GROUP, label: "", value: "x" }
  ];
  assert.deepEqual(buildBrandStory(specs), [{ heading: "Built to last", text: "Strong body.", photo: null }]);
  assert.deepEqual(buildInfoGroups(specs), []);
  assert.equal(isTemplateGroup(BRAND_GROUP), false);
  assert.deepEqual(specLimitsFor(BRAND_GROUP, { label: 40, value: 120 }), { label: 80, value: 600 });
});

test("brand story: a block's chosen photo round-trips and is cleaned out of the table", async () => {
  const { brandRows, brandSpecs, buildBrandStory, buildInfoGroups } = await import("./index.js");
  const specs = brandSpecs([{ heading: "Built to last", text: "Strong.", photo: "3" }, { heading: "Light", text: "Easy.", photo: "" }]);
  assert.equal(specs.length, 3);
  assert.deepEqual(buildBrandStory(specs).map((b) => b.photo), [3, null]);
  assert.deepEqual(brandRows(specs).map((r) => r.photo), ["3", ""]);
  assert.deepEqual(buildInfoGroups(specs), []);
});
