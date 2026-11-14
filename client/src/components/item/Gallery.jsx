import { useMemo } from "react";
import { ItemGallery } from "@epicmkt/ui";
import { focusMediaId } from "@epicmkt/shared";

// Gallery slot: the item's photos and videos. `slot` is what ItemView hands every part it draws (item, t). Nothing to show without an item.
// When the buyer picks a size, type or colour that has its own photo, the gallery jumps to it (focusMediaId says which one wins).
export default function Gallery({ ctx, slot }) {
  const option = ctx?.option ?? null;
  const id = option ? focusMediaId({ axes: option.axes, variant: option.variant, choice: option.choice, lastAxisKey: option.lastAxisKey }) : null;
  const focus = useMemo(() => (id ? { id, n: option?.pickCount ?? 0 } : null), [id, option?.pickCount]);
  if (!slot?.item) return null;
  return <ItemGallery {...slot} focus={focus} />;
}
