import test from "node:test";
import assert from "node:assert/strict";
import { departmentTrail, groupItemsByDepartment, isMixedShop } from "./browse.js";

test("trail: department alone is the last crumb", () => {
  assert.deepEqual(departmentTrail({ id: "phones", name: "Phones" }), [{ id: "phones", name: "Phones" }]);
});
test("trail: department then type", () => {
  const t = departmentTrail({ id: "phones", name: "Phones" }, { id: "phone", name: "Phone" });
  assert.equal(t[0].to, "/d/phones");
  assert.equal(t[1].to, undefined);
  assert.equal(t[1].name, "Phone");
});
test("trail: nothing without a department", () => assert.deepEqual(departmentTrail(null), []));
test("groups keep department order and put Other last", () => {
  const g = groupItemsByDepartment(
    [{ id: 1, departmentId: "furniture" }, { id: 2 }, { id: 3, departmentId: "phones" }, { id: 4, departmentId: "furniture" }],
    [{ id: "phones", name: "Phones" }, { id: "furniture", name: "Furniture" }]
  );
  assert.deepEqual(g.map((x) => [x.name, x.items.length]), [["Phones", 1], ["Furniture", 2], ["Other", 1]]);
});
test("empty groups are dropped", () => assert.deepEqual(groupItemsByDepartment([], [{ id: "a", name: "A" }]), []));
test("mixed shop needs two departments with items", () => {
  assert.equal(isMixedShop([{ count: 2 }]), false);
  assert.equal(isMixedShop([{ count: 2 }, { count: 1 }]), true);
  assert.equal(isMixedShop(null), false);
});
