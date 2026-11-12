import { ItemHeader } from "@epicmkt/ui";
import { stateLabels } from "../../lib/itemView.js";
import styles from "./Header.module.css";

// Header slot: brand, title, short description and price. The title is the page's heading (h1 on a page, h2 in the sheet) and takes
// focus when an item opens, so Heading and headingRef come through `slot` unchanged. Condition, authenticity, fragrance state and
// charger kind show as text badges above the brand.
export default function Header({ ctx, slot }) {
  if (!slot?.item) return null;
  const labels = stateLabels(slot.item, ctx?.option?.variant?.specOverrides);
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
    </>
  );
}
