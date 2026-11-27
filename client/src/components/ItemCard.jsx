import { ItemCard as Card } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import FlashChip from "./FlashChip.jsx";
import { useSaveAction } from "./saved/useSave.js";

const labels = { was: null };

export default function ItemCard({ item, onSelect, className = "", save = true }) {
  // The Save heart, beside the card's button (never inside it).
  const action = useSaveAction(save ? item : null);
  return (
    <Card
      item={item}
      action={action ?? undefined}
      onSelect={onSelect}
      className={className}
      labels={{ ...labels, was: t("item.was"), lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft"), offerChip: { offer: t("offer.chip"), more: t("offer.more") } }}
      renderFlash={(chipClass) => <FlashChip endsAt={item.flash.sale.endsAt} className={chipClass} />}
    />
  );
}
