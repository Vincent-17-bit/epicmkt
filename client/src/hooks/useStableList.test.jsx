import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStableList } from "./useStableList.js";

const ids = (list) => list.map((i) => i.id);
const item = (id) => ({ id });
const run = (initial) => renderHook(({ key, items }) => useStableList(key, items, (i) => i.id), { initialProps: { key: "a", items: initial.map(item) } });

describe("useStableList", () => {
  it("keeps what is on screen where it is when a refetch puts a new product in the middle", () => {
    const view = run(["a", "b", "c"]);
    view.rerender({ key: "a", items: ["a", "NEW", "b", "c"].map(item) });
    expect(ids(view.result.current)).toEqual(["a", "b", "c", "NEW"]);
  });

  it("keeps the order when the server reorders the same products", () => {
    const view = run(["a", "b", "c"]);
    view.rerender({ key: "a", items: ["c", "b", "a"].map(item) });
    expect(ids(view.result.current)).toEqual(["a", "b", "c"]);
  });

  it("drops a product that is gone, and shows the newest data of the ones that stay", () => {
    const view = run(["a", "b", "c"]);
    view.rerender({ key: "a", items: [{ id: "c", closed: true }, { id: "a" }] });
    expect(view.result.current).toEqual([{ id: "a" }, { id: "c", closed: true }]);
  });

  it("starts over for another list", () => {
    const view = run(["a", "b"]);
    view.rerender({ key: "b", items: ["b", "a"].map(item) });
    expect(ids(view.result.current)).toEqual(["b", "a"]);
  });
});
