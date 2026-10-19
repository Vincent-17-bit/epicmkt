import { ProductCard } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import FlashChip from "./FlashChip.jsx";

const renderFlash = (className, sale) => <FlashChip endsAt={sale.endsAt} className={className} />;

export default function ItemCard({ item, onSelect, className }) {
  const labels = {
    was: t("item.was"),
    availability: {
      available: t("item.availability.available"),
      limited: t("item.availability.limited"),
      unavailable: t("item.availability.unavailable")
    }
  };
  return <ProductCard item={item} onSelect={onSelect} className={className} labels={labels} renderFlash={renderFlash} />;
}
