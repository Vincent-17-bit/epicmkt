import { test } from "node:test";
import assert from "node:assert/strict";
import { planRename, planRemove, applyRewrite, normalizeSectionName, validSectionName, SectionError } from "./sections.js";
import { SECTION_CASES, SECTION_REFUSALS } from "./section-cases.js";

const run = (c) => (c.op === "rename" ? planRename(c.list, ...c.args) : planRemove(c.list, ...c.args));

test("section cases: list, merge flag and every item's new section", () => {
  for (const c of SECTION_CASES) {
    const out = run(c);
    assert.deepEqual(out.sections, c.sections, JSON.stringify(c));
    if (c.op === "rename") assert.equal(out.merged, c.merged, JSON.stringify(c));
    assert.deepEqual(c.items.map((s) => (s == null ? null : applyRewrite(s, out.rewrite) || null)), c.after, JSON.stringify(c));
  }
});

test("refusals raise the codes the database raises", () => {
  for (const c of SECTION_REFUSALS) assert.throws(() => run(c), (e) => e instanceof SectionError && e.code === c.code, JSON.stringify(c));
});

test("rename keeps the position, merge keeps the existing section's position", () => {
  assert.deepEqual(planRename(["A1", "B2", "C3"], "B2", "Zed").sections, ["A1", "Zed", "C3"]);
  assert.deepEqual(planRename(["A1", "B2", "C3"], "C3", "a1").sections, ["A1", "B2"]);
});

test("a rename that only changes case or spacing is a rename, not a merge", () => {
  const out = planRename(["Cuts"], "cuts", "CUTS");
  assert.equal(out.merged, false);
  assert.deepEqual(out.sections, ["CUTS"]);
});

test("planners never mutate their input", () => {
  const list = ["Cuts", "Braids"];
  planRename(list, "Cuts", "Fades");
  planRemove(list, "Cuts", "Braids");
  assert.deepEqual(list, ["Cuts", "Braids"]);
});

test("name rules", () => {
  assert.equal(normalizeSectionName("  a   b  "), "a b");
  assert.equal(validSectionName("ab"), true);
  assert.equal(validSectionName("a"), false);
  assert.equal(validSectionName("x".repeat(40)), true);
  assert.equal(validSectionName("x".repeat(41)), false);
  assert.equal(validSectionName("  "), false);
});

test("applyRewrite leaves empty and unrelated sections alone, matches ignoring case", () => {
  const rw = { from: "Cuts", to: "Haircuts" };
  assert.equal(applyRewrite("cuts", rw), "Haircuts");
  assert.equal(applyRewrite("Braids", rw), "Braids");
  assert.equal(applyRewrite("", rw), "");
  assert.equal(applyRewrite(null, rw), null);
  assert.equal(applyRewrite("Cuts", { from: "Cuts", to: null }), "");
});
