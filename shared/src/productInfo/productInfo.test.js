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
