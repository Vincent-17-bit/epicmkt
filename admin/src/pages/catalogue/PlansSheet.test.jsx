import { describe, expect, it } from "vitest";
import { sheetGroups } from "./PlansSheet.jsx";

const g = (id, grp, active = true) => ({ category_id: id, category_name: id, grp, active, plans: {} });

describe("sheetGroups", () => {
  it("lists active categories by group and leaves switched-off ones out", () => {
    const out = sheetGroups([g("a", "Food"), g("b", "Food", false), g("c", "Services")]);
    expect(out.map((s) => [s.name, s.rows.map((r) => r.category_id)])).toEqual([["Food", ["a"]], ["Services", ["c"]]]);
  });
});
