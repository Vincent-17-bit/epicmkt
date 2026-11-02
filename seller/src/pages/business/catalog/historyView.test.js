import { describe, expect, it } from "vitest";
import { describeChange, groupHistory } from "./historyView.js";

const row = (id, field, old_value, new_value, at = "2026-10-28T14:39:10Z", actor_role = "seller") => ({ id, field, old_value, new_value, actor_role, created_at: at });

describe("history view", () => {
  it("shows a text change as before and after", () => {
    expect(describeChange(row(1, "pack_size", "12", "6 Pieces"))).toMatchObject({ label: "Pack size", verb: "Changed", before: "12", after: "6 Pieces" });
  });

  it("calls a first value Added and a removed value Cleared", () => {
    expect(describeChange(row(1, "brand", null, "Sunrise Bakery")).verb).toBe("Added");
    expect(describeChange(row(2, "brand", "Sunrise Bakery", "")).verb).toBe("Cleared");
  });

  it("turns includes into added and removed lines", () => {
    const c = describeChange(row(1, "includes", JSON.stringify(["a", "b"]), JSON.stringify(["b", "c"])));
    expect(c).toMatchObject({ kind: "list", verb: "Changed", added: ["c"], removed: ["a"] });
  });

  it("reads highlights and specs as plain lines", () => {
    expect(describeChange(row(1, "highlights", "[]", JSON.stringify([{ title: "Fresh", text: "Baked daily" }]))).added).toEqual(["Fresh: Baked daily"]);
    const s = describeChange(row(2, "specs", "[]", JSON.stringify([{ group: "G", label: "Flavor:", value: "Cardamom" }])));
    expect(s).toMatchObject({ verb: "Added", added: ["Flavor: Cardamom"] });
  });

  it("formats money, flags and availability", () => {
    expect(describeChange(row(1, "price", "450.00", "500.00"))).toMatchObject({ before: "KES 450", after: "KES 500" });
    expect(describeChange(row(2, "visible", "true", "false"))).toMatchObject({ before: "Showing", after: "Hidden" });
    expect(describeChange(row(3, "availability", "available", "limited_stock")).after).toBe("Limited stock");
  });

  it("survives broken list text", () => {
    expect(describeChange(row(1, "specs", "nope", "{")).added).toEqual([]);
  });

  it("groups changes saved together by the same person, newest first", () => {
    const groups = groupHistory([
      row(3, "brand", null, "X", "2026-10-28T14:39:50Z"),
      row(2, "terms", null, "Y", "2026-10-28T14:39:10Z"),
      row(1, "terms", null, "Z", "2026-10-27T11:04:00Z"),
      row(0, "visible", "true", "false", "2026-10-27T11:04:30Z", "admin"),
    ]);
    expect(groups.map((g) => g.changes.length)).toEqual([2, 1, 1]);
    expect(groups[2].actor).toBe("admin");
  });
});
