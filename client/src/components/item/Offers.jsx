import PromotionsRow from "./PromotionsRow.jsx";

export default function Offers({ ctx }) {
  const { item, shown, onSelect } = ctx;
  if (!item) return null;
  return <PromotionsRow offers={item.offers} item={item} price={shown?.salePrice ?? null} onOpenProduct={onSelect} />;
}
