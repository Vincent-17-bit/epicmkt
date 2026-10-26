import { ItemCard as Card } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import FlashChip from "./FlashChip.jsx";

const labels = { was: null };

export default function ItemCard({ item, onSelect, className = "" }) {
  return (
    <Card
      item={item}
      onSelect={onSelect}
      className={className}
      labels={{ ...labels, was: t("item.was"), lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft"), offerChip: { offer: t("offer.chip"), more: t("offer.more") } }}
      renderFlash={(chipClass) => <FlashChip endsAt={item.flash.sale.endsAt} className={chipClass} />}
    />
  );
}
