import Tiers from "./Tiers.jsx";

// Slot for quantity. For an item with quantity-tier prices it shows the tier table with a quantity and the total; for any other item it
// renders nothing and the page is unchanged. It sits in the info block, right after Offers.
export default function Quantity({ ctx, slot }) {
  const item = slot?.item;
  if (!item?.priceTiers && !ctx?.option?.variant?.priceTiers) return null;
  return <Tiers item={item} variant={ctx?.option?.variant} />;
}
