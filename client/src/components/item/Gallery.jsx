import { ItemGallery } from "@epicmkt/ui";

// Gallery slot: the item's photos and videos. `slot` is what ItemView hands every part it draws (item, t). Nothing to show without an item.
export default function Gallery({ slot }) {
  if (!slot?.item) return null;
  return <ItemGallery {...slot} />;
}
