import { relevance } from "../similar.js";
import { seededKey } from "./complements.js";

// "More from this store" (Store Selective) order, shared by the demo backend and the live adapter.
// The store's other items, the closest to the one being viewed first: same section, then how alike the names are (the same
// relevance Similar items uses: another Ankara dress before a jacket), then items on a flash sale, then newest. The order is
// stable: ties end on the id. `current` may be missing (an item that could not be read): then it is flash, newest, id.
// With a `seed` (one per visit) the items that are equally close come in a shuffled order instead of flash-then-newest, the same
// for the whole visit: the store's newest item is not always the first one shown.
export function orderStoreItems(current, rows, { seed = null } = {}) {
  const visit = seed === null || seed === undefined || seed === "" ? null : String(seed);
  const section = (x) => String(x?.section ?? "").trim().toLowerCase();
  const mine = section(current);
  const keyOf = (row) => [
    mine && section(row) === mine ? 0 : 1,
    current ? -relevance(current, row).score : 0,
    ...(visit === null ? [row.flash ? 0 : 1, -(Date.parse(row.createdAt ?? "") || 0)] : [seededKey(visit, row.id)])
  ];
  return rows
    .map((row) => ({ row, key: keyOf(row) }))
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i += 1) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      return String(a.row.id) < String(b.row.id) ? -1 : 1;
    })
    .map((x) => x.row);
}
