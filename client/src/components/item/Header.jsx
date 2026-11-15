import { ItemHeader } from "@epicmkt/ui";
import { unitPrice } from "@epicmkt/shared";
import { stateLabels, variantOverrides } from "../../lib/itemView.js";
import styles from "./Header.module.css";

// Header slot: brand, title, short description and price. The title is the page's heading (h1 on a page, h2 in the sheet) and takes
// focus when an item opens, so Heading and headingRef come through `slot` unchanged. Condition, authenticity, fragrance state and
// charger kind show as text badges above the brand.
// "KES 150 per kg" for the chosen weight or volume, from the price the buyer pays now; null when no chosen size is a weight or a volume.
export function unitPriceFor(option) {
  const v = option?.variant;
  if (!v || !Number.isFinite(v.price)) return null;
  const pay = Number.isFinite(v.salePrice) && v.salePrice < v.price ? v.salePrice : v.price;
  for (const axis of option.axes ?? []) {
    const size = axis.values?.find((x) => x.id === option.choice?.[axis.key])?.label;
    const per = size ? unitPrice(pay, size) : null;
    if (per) return per;
  }
  return null;
}

export default function Header({ ctx, slot }) {
  if (!slot?.item) return null;
  const labels = stateLabels(slot.item, variantOverrides(ctx?.option?.variant));
  const per = unitPriceFor(ctx?.option);
  return (
    <>
      {labels.length > 0 && (
        <ul className={styles.states} data-testid="state-labels">
          {labels.map((l) => (
            <li key={l.key} className={styles.state}>
              {l.label}: <strong>{l.value}</strong>
            </li>
          ))}
        </ul>
      )}
      <ItemHeader {...slot} />
      {per && <p className={styles.unitPrice} data-testid="unit-price">{per.text}</p>}
    </>
  );
}
