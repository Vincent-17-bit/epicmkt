import { test } from "node:test";
import assert from "node:assert/strict";
import { contractTypeFromRow, groupOf, seededForConformance } from "./seeded.js";
import { checkType } from "./index.js";
import { checkProductType } from "../contracts/validators.js";

const row = (over = {}) => ({ id: "meat", name: "Meat", kind: "good", departmentId: "food-drink", categoryIds: ["a"], restrictedTo: [], quantityMode: "measure",
  axes: [{ key: "cut", label: "Cut", display: "button", open: "cut", suggested: [{ id: "steak", label: "Steak" }] }], specRows: [], extras: { measureUnit: "kg" }, ...over });

test("a stored type reads as a contract type: group, price type, unit and fields follow its kind, quantity and extras", () => {
  const t = contractTypeFromRow(row());
  assert.deepEqual(checkProductType(t), []);
  assert.equal(t.group, "food-drink");
  assert.equal(t.unit, "kg");
  assert.deepEqual(t.itemFields, ["quantity"]);
  assert.deepEqual(t.axes[0], { key: "cut", label: "Cut", display: "button", suggested: [{ id: "steak", label: "Steak" }] });
  assert.equal(groupOf({ kind: "service", departmentId: "food-drink" }), "services");
  assert.equal(groupOf({ kind: "good", departmentId: "somewhere-new" }), "electronics");
});

test("a booked service prices from, and the contract form of dependsOn is read as its key", () => {
  const t = contractTypeFromRow(row({ kind: "service", quantityMode: "none", axes: [{ key: "a", label: "A", display: "button" }, { key: "b", label: "B", display: "button", dependsOn: { axis: "a", allowed: {} } }] }));
  assert.equal(t.priceType, "from");
  assert.equal(t.unit, null);
  assert.equal(t.axes[1].dependsOn, "a");
});

test("seeded types come with the categories that list or may sell them, and pass the stages", () => {
  const { types, typeCategories } = seededForConformance([row({ restrictedTo: ["b"] })]);
  assert.deepEqual(typeCategories.meat, ["a", "b"]);
  assert.equal(checkType(types[0]).ok, true);
});
