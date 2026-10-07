import { ItemCard as UiItemCard } from "@epicmkt/ui";
import FlashChip from "./FlashChip.jsx";

const renderFlash = (className, sale) => <FlashChip endsAt={sale.endsAt} className={className} />;

export default function ItemCard(props) {
  return <UiItemCard renderFlash={renderFlash} {...props} />;
}
