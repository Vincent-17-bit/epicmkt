import { describe, it, expect, afterEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { emptyItemForm, validateItemForm } from "@epicmkt/shared";
import { CHECKS, qualityChecks, registerCheck } from "./checks/index.js";
import { qualityScore, firstErrorTarget } from "./model.js";
import { SLICES, itemReducer, sliceOf } from "./model/index.js";
import { useItemModel } from "./model/useItemModel.js";
import OptionsStep from "./steps/OptionsStep.jsx";
import { STEPS, visibleSteps } from "./steps/index.js";

const form = (over = {}) => ({ ...emptyItemForm(), ...over });
const model = (over = {}) => ({ form: form(), errors: {}, mediaCount: 0, ...over });

describe("steps registry", () => {
  it("keeps the order, with a Type step after Basics and an Options slot before Price and stock", () => {
    expect(STEPS.map((s) => s.id)).toEqual(["media", "basics", "type", "options", "price", "details", "review"]);
    expect(STEPS.map((s) => s.label)).toEqual(["Media", "Basics", "Type", "Options", "Price and stock", "Details", "Review"]);
  });

  it("shows the Type step only for an item that went through the type picker (null means Other goods)", () => {
    expect(visibleSteps(model()).map((s) => s.id)).not.toContain("type");
    expect(visibleSteps(model({ form: form({ productTypeId: "pt-dress" }) })).map((s) => s.id)).toContain("type");
    expect(visibleSteps(model({ form: form({ productTypeId: null }) })).map((s) => s.id)).toContain("type");
  });

  it("shows the seller the same five steps as before (Options stays hidden)", () => {
    const seen = visibleSteps(model());
    expect(seen.map((s) => s.id)).toEqual(["media", "basics", "price", "details", "review"]);
    expect(seen.map((s) => s.short)).toEqual(["Media", "Basics", "Price", "Details", "Review"]);
  });

  it("gives every step the full shape, and the Options slot renders nothing", () => {
    for (const s of STEPS) {
      expect(typeof s.component).toBe("function");
      expect(typeof s.visibleWhen).toBe("function");
      expect(typeof s.issues).toBe("function");
      expect(typeof s.done).toBe("function");
    }
    const { container } = render(<OptionsStep />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a step that hides itself drops out of the visible list", () => {
    const hidden = STEPS.map((s) => (s.id === "details" ? { ...s, visibleWhen: () => false } : s));
    expect(hidden.filter((s) => s.visibleWhen(model())).map((s) => s.id)).not.toContain("details");
  });

  it("ticks steps as the old navigation did", () => {
    const by = (id) => STEPS.find((s) => s.id === id);
    expect(by("media").done(model({ mediaCount: 1 }))).toBe(true);
    expect(by("media").done(model())).toBe(false);
    expect(by("basics").done(model({ form: form({ name: "ab" }) }))).toBe(true);
    expect(by("basics").done(model({ form: form({ name: "a" }) }))).toBe(false);
    expect(by("price").done(model({ form: form({ priceType: "contact" }) }))).toBe(true);
    expect(by("price").done(model({ form: form({ price: "" }) }))).toBe(false);
    expect(by("price").done(model({ form: form({ price: "10" }) }))).toBe(true);
    expect(by("details").done(model())).toBe(false);
    expect(by("details").done(model({ form: form({ terms: "No refunds" }) }))).toBe(true);
    expect(by("review").done(model())).toBe(false);
  });

  it("sorts each problem into the step that owns the field", () => {
    const bad = validateItemForm(form({ name: "", price: "", highlights: [{ title: "", text: "" }, { title: "x", text: "" }] }));
    const at = (id) => STEPS.find((s) => s.id === id).issues(model({ errors: bad.errors })).map((e) => e.focus);
    expect(at("basics")).toEqual(["name"]);
    expect(at("price")).toEqual(["price"]);
    expect(at("details")).toEqual(["hl-1-text"]);
    expect(at("review")).toEqual([]);
    expect(firstErrorTarget(bad.errors)).toMatchObject({ step: "basics", focus: "name" });
  });
});

describe("form reducer slices", () => {
  it("lists the slices in order", () => {
    expect(SLICES.map((s) => s.id)).toEqual(["basics", "options", "prices", "media", "specs", "type"]);
  });

  it("owns every key of a new item exactly once", () => {
    const owned = SLICES.flatMap((s) => s.keys);
    expect(new Set(owned).size).toBe(owned.length);
    expect(Object.keys(emptyItemForm()).filter((k) => !owned.includes(k))).toEqual([]);
  });

  it("routes a field to its slice", () => {
    expect(sliceOf("name").id).toBe("basics");
    expect(sliceOf("price").id).toBe("prices");
    expect(sliceOf("variants").id).toBe("prices");
    expect(sliceOf("specs").id).toBe("specs");
    expect(sliceOf("nope")).toBeNull();
  });

  it("patches one key and leaves the form flat, with the same keys", () => {
    const start = form();
    const next = itemReducer(start, { type: "patch", key: "name", value: "Kettle" });
    expect(next).not.toBe(start);
    expect(next.name).toBe("Kettle");
    expect({ ...next, name: "" }).toEqual(start);
    expect(Object.keys(next)).toEqual(Object.keys(start));
    expect(JSON.stringify(itemReducer(start, { type: "patch", key: "name", value: "" }))).toBe(JSON.stringify(start));
  });

  it("stores a key no slice owns instead of dropping it", () => {
    expect(itemReducer(form(), { type: "patch", key: "later", value: 1 }).later).toBe(1);
  });

  it("replaces the whole form, and ignores actions it does not know", () => {
    const saved = form({ name: "Saved" });
    expect(itemReducer(form({ name: "Edited" }), { type: "replace", form: saved })).toBe(saved);
    const start = form();
    expect(itemReducer(start, { type: "whatever" })).toBe(start);
  });

  it("lets a slice handle its own action", () => {
    const slice = { id: "tmp", keys: ["tmpKey"], reduce: (f, a) => (a.type === "clear" ? { ...f, tmpKey: "" } : undefined) };
    SLICES.push(slice);
    try {
      expect(itemReducer({ tmpKey: "x" }, { type: "clear" }).tmpKey).toBe("");
    } finally {
      SLICES.pop();
    }
  });

  it("useItemModel keeps patch and replace stable, and edits across slices", () => {
    const { result } = renderHook(() => useItemModel(form()));
    const { patch, replace } = result.current;
    act(() => { patch("name", "A"); patch("price", "5"); patch("highlights", [{ title: "t", text: "x" }]); });
    expect(result.current.form).toMatchObject({ name: "A", price: "5" });
    expect(result.current.form.highlights).toHaveLength(1);
    expect(result.current.patch).toBe(patch);
    act(() => replace(form({ name: "B" })));
    expect(result.current.form.name).toBe("B");
    expect(result.current.replace).toBe(replace);
  });
});

describe("quality check registry", () => {
  const ids = () => CHECKS.map((c) => c.id);
  afterEach(() => {
    while (CHECKS.some((c) => c.id.startsWith("test-"))) CHECKS.splice(CHECKS.findIndex((c) => c.id.startsWith("test-")), 1);
  });

  it("keeps the original eight checks, in order, worth 100", () => {
    expect(ids()).toEqual(["photo", "name", "short", "description", "section", "price", "highlights", "specs"]);
    expect(qualityChecks(form(), 0).map((c) => Object.keys(c))[0]).toEqual(["id", "weight", "done", "step", "focus", "todo", "done_text"]);
    expect(qualityScore(qualityChecks(form(), 0).map((c) => ({ ...c, done: true })))).toBe(100);
  });

  it("appends a check, which then counts in the list", () => {
    registerCheck({ id: "test-options", weight: 0, step: "options", focus: "x", todo: "t", done_text: "d", isDone: () => true });
    expect(ids().at(-1)).toBe("test-options");
    expect(qualityChecks(form(), 0).at(-1)).toMatchObject({ id: "test-options", done: true });
  });

  it("inserts after another check, skips a check whose `when` is false, and refuses a repeated id", () => {
    registerCheck({ id: "test-mid", weight: 0, step: "basics", focus: "x", todo: "t", done_text: "d", isDone: () => false, when: () => false }, { after: "name" });
    expect(ids().indexOf("test-mid")).toBe(2);
    expect(qualityChecks(form(), 0).some((c) => c.id === "test-mid")).toBe(false);
    expect(() => registerCheck({ id: "photo" })).toThrow(/already registered/);
  });
});
