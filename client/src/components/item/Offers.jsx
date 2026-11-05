import OfferStrip from "../OfferStrip.jsx";

// The offers this item is part of. OfferStrip shows nothing for an item that is in no offer.
export default function Offers({ ctx }) {
  const { item, shown, onSelect } = ctx;
  if (!item) return null;
  return <OfferStrip offers={item.offers} item={item} price={shown?.salePrice ?? null} onOpenProduct={onSelect} />;
}
