import { ItemHeader } from "@epicmkt/ui";
import { sizeInItemName, unitPricePolicy, unitPrices } from "@epicmkt/shared";
import { amountText } from "@epicmkt/shared";
import { stateLabels, variantOverrides } from "../../lib/itemView.js";
import { shownForQty } from "../../lib/lineFor.js";
import { t } from "../../i18n/index.js";
import styles from "./Header.module.css";

// Header slot: brand, title, short description and price. The title is the page's heading (h1 on a page, h2 in the sheet) and takes
// focus when an item opens, so Heading and headingRef come through `slot` unchanged. Condition, authenticity, fragrance state and
// charger kind show as text badges above the brand.
// "KES 150 per kg", "KES 250 per piece": every unit price of the chosen size, from the price the buyer pays now, as [{ amount, unit, text }].
// The chosen size comes first; when none of the chosen sizes is a weight, volume or count, the one size the item's name states is used
// ("Soda 24 Pack", "Bread 400g") with the shown price.
export function unitPricesFor(option, item, shown) {
  const policy = unitPricePolicy({ productType: item?.productType, kind: item?.kind });
  if (!policy.measure && !policy.count) return [];
  const v = option?.variant;
  if (v && Number.isFinite(v.price)) {
    const pay = Number.isFinite(v.salePrice) && v.salePrice < v.price ? v.salePrice : v.price;
    for (const axis of option.axes ?? []) {
      const size = axis.values?.find((x) => x.id === option.choice?.[axis.key])?.label;
      const found = size ? unitPrices(pay, size, policy) : [];
      if (found.length) return found;
    }
  }
  const size = sizeInItemName(item?.name, { measure: policy.nameMeasure });
  const base = v && Number.isFinite(v.price) ? v : shown;
  const price = Number.isFinite(base?.salePrice) && base.salePrice < base.price ? base.salePrice : base?.price;
  return size && Number.isFinite(price) ? unitPrices(price, size, policy) : [];
}

export const unitPriceFor = (option, item, shown) => unitPricesFor(option, item, shown)[0] ?? null;

export default function Header({ ctx, slot }) {
  if (!slot?.item) return null;
  const labels = stateLabels(slot.item, variantOverrides(ctx?.option?.variant));
  const per = unitPricesFor(ctx?.option, slot.item, slot.shown);
  // The price is the total for the chosen quantity, never the calculation. "for 3" / "for 1.5 kg" says what it is for.
  const line = ctx?.line;
  const many = Boolean(line?.order && line.priced && line.qty !== 1);
  const shown = many ? shownForQty(slot.shown, line) : slot.shown;
  const header = many && slot.item.pricing?.unit ? { ...slot, shown, item: { ...slot.item, pricing: { ...slot.item.pricing, unit: null } } } : { ...slot, shown };
  const forText = many ? t("qty.priceFor").replace("{amount}", line.info?.mode === "measure" ? amountText(line.qty, line.info.unit) : String(line.qty)) : "";
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
      <ItemHeader {...header} />
      {many && <p className={styles.priceFor} data-testid="price-for">{forText}</p>}
      {per.length > 0 && <p className={styles.unitPrice} data-testid="unit-price">{per.map((x) => x.text).join(" · ")}</p>}
    </>
  );
}
