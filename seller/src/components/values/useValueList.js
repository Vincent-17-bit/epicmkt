import { useState } from "react";
import { MAX_VALUES, addValue, moveValue, previewOf, removeValue } from "./scaleEditing.js";
import { T } from "./text.js";

// The list behaviour every scale editor shares: add (merging duplicates by sizeKey with a quiet notice), reorder, remove, and a polite
// announcement for screen readers. `show` is how one value reads to a buyer.
export function useValueList({ values, onChange, show }) {
  const [notice, setNotice] = useState("");
  const [announce, setAnnounce] = useState("");

  const addMany = (incoming) => {
    let next = values;
    const merged = [];
    let added = 0;
    for (const v of incoming) {
      const r = addValue(next, v);
      if (r.full) { setNotice(T.listFull(MAX_VALUES)); break; }
      if (r.merged) merged.push(show(v));
      if (r.added) { next = r.values; added += 1; }
    }
    if (added) onChange(next);
    const said = added === 1 ? T.addedOne(show(incoming.find((v) => next.includes(v)) ?? incoming[0])) : added > 1 ? T.addedMany(added) : "";
    setAnnounce(said);
    setNotice(merged.length ? T.alreadyThere(merged.join(", ")) : "");
    return { added, merged: merged.length };
  };
  const move = (i, by) => {
    const next = moveValue(values, i, by);
    if (next === values) return;
    onChange(next);
    setAnnounce(T.movedTo(show(values[i]), i + by + 1, values.length));
  };
  const remove = (i) => {
    setAnnounce(T.removedOne(show(values[i])));
    onChange(removeValue(values, i));
  };
  return { notice, announce, setNotice, setAnnounce, addMany, move, remove };
}

export { previewOf };
