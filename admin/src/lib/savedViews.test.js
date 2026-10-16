import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_NAME, MAX_VIEWS, deleteView, findView, loadPrefs, loadViews, savePrefs, saveView, setDefaultView, viewsKey } from "./savedViews.js";

const fake = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, m }; };

test("an empty or damaged store gives no views, never an error", () => {
  const storage = fake();
  assert.deepEqual(loadViews("apps", { storage }), { views: [], defaultId: null });
  for (const junk of ["{", "null", "42", '"x"', '{"views":"no"}', '{"views":[{"id":1}]}']) {
    storage.setItem(viewsKey("apps"), junk);
    assert.deepEqual(loadViews("apps", { storage }), { views: [], defaultId: null }, junk);
  }
});

test("save, load, replace by name (ignoring case), and keep views separate per table and per person", () => {
  const storage = fake();
  const a = saveView("apps", "  My   overdue  ", { status: "submitted", sla: "breached" }, { storage });
  assert.equal(a.view.name, "My overdue");
  assert.deepEqual(loadViews("apps", { storage }).views.map((v) => v.name), ["My overdue"]);
  const again = saveView("apps", "my OVERDUE", { status: "submitted", sla: "soon" }, { storage });
  assert.equal(again.view.id, a.view.id); // replaced, not duplicated
  assert.equal(loadViews("apps", { storage }).views.length, 1);
  assert.equal(findView(loadViews("apps", { storage }), a.view.id).state.sla, "soon");
  assert.equal(loadViews("payments", { storage }).views.length, 0);
  assert.equal(loadViews("apps", { storage, scope: "amina" }).views.length, 0);
  saveView("apps", "Mine", {}, { storage, scope: "amina" });
  assert.equal(loadViews("apps", { storage }).views.length, 1);
  assert.equal(loadViews("apps", { storage, scope: "amina" }).views.length, 1);
});

test("a saved state is a copy, not a reference", () => {
  const storage = fake();
  const state = { status: "submitted", columns: ["a"] };
  const { view } = saveView("apps", "x", state, { storage });
  state.columns.push("b");
  assert.deepEqual(view.state.columns, ["a"]);
});

test("names are required and limited; the number of views is limited", () => {
  const storage = fake();
  assert.match(saveView("apps", "   ", {}, { storage }).error, /name/);
  assert.equal(saveView("apps", "x".repeat(100), {}, { storage }).view.name.length, MAX_NAME);
  const s2 = fake();
  for (let i = 0; i < MAX_VIEWS; i += 1) assert.ok(saveView("apps", `v${i}`, {}, { storage: s2 }).view);
  assert.match(saveView("apps", "one too many", {}, { storage: s2 }).error, /up to 20/);
  assert.ok(saveView("apps", "V3", { changed: true }, { storage: s2 }).view); // replacing is still allowed at the limit
});

test("default view: set, clear, and cleared again when its view is deleted", () => {
  const storage = fake();
  const a = saveView("apps", "A", {}, { storage }).view;
  const b = saveView("apps", "B", {}, { storage }).view;
  assert.equal(setDefaultView("apps", a.id, { storage }).defaultId, a.id);
  assert.equal(setDefaultView("apps", "nope", { storage }).defaultId, null);
  setDefaultView("apps", b.id, { storage });
  assert.equal(deleteView("apps", a.id, { storage }).defaultId, b.id); // deleting another view keeps the default
  const after = deleteView("apps", b.id, { storage });
  assert.deepEqual(after, { views: [], defaultId: null });
});

test("a stored default that points at nothing is dropped on load", () => {
  const storage = fake();
  storage.setItem(viewsKey("apps"), JSON.stringify({ views: [{ id: "a", name: "A", state: {} }], defaultId: "gone" }));
  assert.equal(loadViews("apps", { storage }).defaultId, null);
});

test("when storage throws, views still work for this session", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(loadViews("apps", { storage: broken }), { views: [], defaultId: null });
  assert.ok(saveView("apps", "A", {}, { storage: broken }).data); // no throw
});

test("column and density preferences round trip and ignore junk", () => {
  const storage = fake();
  assert.deepEqual(loadPrefs("apps", { storage }), {});
  savePrefs("apps", { columns: ["name", "plan"], density: "compact" }, { storage });
  assert.deepEqual(loadPrefs("apps", { storage }), { columns: ["name", "plan"], density: "compact" });
  storage.setItem("epicmkt-admin-table:apps", JSON.stringify({ columns: [1, "ok"], density: "huge" }));
  assert.deepEqual(loadPrefs("apps", { storage }), { columns: ["ok"], density: undefined });
});
