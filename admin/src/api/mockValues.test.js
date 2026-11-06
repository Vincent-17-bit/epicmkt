import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { approveOptionValue, listOptionValues, mergeOptionValue, renameOptionValue, resetMockValues, updateOptionValue } from "./mockValues.js";

beforeEach(resetMockValues);
const find = async (label) => (await listOptionValues({ limit: 200 })).values.find((v) => v.label === label);

describe("mock open values follow the database rules", () => {
  it("lists by status, kind and search (by key, so case and punctuation do not matter)", async () => {
    const pending = await listOptionValues({ status: "pending" });
    assert.ok(pending.values.every((v) => v.status === "pending"));
    assert.deepEqual((await listOptionValues({ kind: "brand", query: "SAMS" })).values.map((v) => v.label).sort(), ["Samsng", "Samsung"]);
    assert.equal((await listOptionValues({ limit: 2 })).values.length, 2);
  });

  it("approve, then update tags and a colour's shade; a material cannot have a shade", async () => {
    const v = await find("Mahogany veneer");
    assert.deepEqual((await approveOptionValue(v.id, { tags: ["Wood", "wood"] })).tags, ["wood"]);
    assert.equal((await find("Mahogany veneer")).status, "approved");
    const wine = await find("Wine red");
    assert.equal((await updateOptionValue(wine.id, { hex: "#AA0000" })).hex, "#aa0000");
    await assert.rejects(updateOptionValue(v.id, { hex: "#aa0000" }), { code: "invalid_hex" });
  });

  it("rename counts the items and refuses a spelling another value already has", async () => {
    const v = await find("Samsng");
    assert.equal((await renameOptionValue(v.id, "Samsung Co")).itemsUpdated, 1);
    await assert.rejects(renameOptionValue(v.id, "SAMSUNG"), { code: "value_exists" });
    await assert.rejects(renameOptionValue(v.id, "--"), { code: "invalid_label" });
  });

  it("merge moves the items, keeps the old value as merged, and refuses other kinds, itself and merged values", async () => {
    const typo = await find("Samsng");
    const good = await find("Samsung");
    const r = await mergeOptionValue(typo.id, good.id);
    assert.equal(r.label, "Samsung");
    assert.equal(r.itemsUpdated, 1);
    assert.equal(r.mergedFrom, typo.id);
    assert.equal((await find("Samsung")).uses, 3);
    assert.deepEqual((await listOptionValues({ status: "merged" })).values.map((v) => v.label), ["Samsng"]);
    await assert.rejects(mergeOptionValue(typo.id, good.id), { code: "value_merged" });
    await assert.rejects(mergeOptionValue(good.id, good.id), { code: "same_value" });
    await assert.rejects(mergeOptionValue(good.id, (await find("Sand")).id), { code: "kind_mismatch" });
    await assert.rejects(approveOptionValue(typo.id), { code: "value_merged" });
  });
});
