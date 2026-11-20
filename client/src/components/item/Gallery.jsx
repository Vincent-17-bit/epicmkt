import { useMemo } from "react";
import { ItemGallery } from "@epicmkt/ui";
import { focusMediaId, zoomOptions } from "@epicmkt/shared";
import { useZoomSettings } from "../../api/zoomSettings.js";

// Gallery slot: the item's photos and videos. `slot` is what ItemView hands every part it draws (item, t). Nothing to show without an item.
// When the buyer picks a size, type or colour that has its own photo, the gallery jumps to it (focusMediaId says which one wins).
export default function Gallery({ ctx, slot }) {
  const option = ctx?.option ?? null;
  const id = option ? focusMediaId({ axes: option.axes, variant: option.variant, choice: option.choice, lastAxisKey: option.lastAxisKey }) : null;
  const zoomSettings = useZoomSettings();
  const zoom = useMemo(() => zoomOptions(zoomSettings), [zoomSettings]);
  const focus = useMemo(() => (id ? { id, n: option?.pickCount ?? 0 } : null), [id, option?.pickCount]);
  if (!slot?.item) return null;
  // "Colour: Black" for the full view, from the buyer's current pick.
  const variantLabel = (option?.axes ?? [])
    .map((axis) => {
      const value = axis.values?.find((v) => v.id === option?.choice?.[axis.key]);
      return value ? `${axis.label}: ${value.label}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  return <ItemGallery {...slot} focus={focus} variantLabel={variantLabel} zoom={zoom} />;
}
