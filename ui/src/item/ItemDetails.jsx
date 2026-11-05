import { useState } from "react";
import { dedupeDescription } from "../lib/media.js";
import ItemDescription from "./ItemDescription.jsx";
import { HIGHLIGHT_LIMIT, normalizeHighlights } from "./itemView.js";
import { itemT } from "./labels.js";
import styles from "./ItemView.module.css";

function Highlights({ items, onMore, t, dataHl }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, HIGHLIGHT_LIMIT);
  return (
    <section className={styles.about} aria-labelledby="item-about" data-hl={dataHl}>
      <h3 id="item-about" className={styles.aboutTitle}>
        {t("item.highlights")}
      </h3>
      <ul className={styles.bullets}>
        {shown.map((entry, index) => (
          <li key={index} className={styles.bullet}>
            {entry.title && <strong className={styles.lead}>{entry.title} </strong>}
            {entry.text}
          </li>
        ))}
      </ul>
      <div className={styles.aboutActions}>
        {items.length > HIGHLIGHT_LIMIT && (
          <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("item.showLess") : t("item.showAll")}
          </button>
        )}
        {onMore && (
          <button type="button" className={styles.moreLink} onClick={onMore}>
            {t("item.moreDetails")}
          </button>
        )}
      </div>
    </section>
  );
}

// The Details slot: the highlights and the description. `onMoreSpecs` (when the item has a specs table) adds the "More details" link
// that opens it; the table itself is the separate specs slot, which sits in its own column. Renders nothing when there is neither.
export default function ItemDetails({ item, t = itemT, onMoreSpecs, marks }) {
  const mark = (part) => marks?.(part);
  const highlights = normalizeHighlights(item.highlights);
  const fullDescription = dedupeDescription(item.shortDescription, item.description);
  if (highlights.length === 0 && !fullDescription) return null;
  return (
    <>
      {highlights.length > 0 && <Highlights key={`highlights-${item.id}`} dataHl={mark("highlights")} items={highlights} onMore={onMoreSpecs} t={t} />}
      {fullDescription && <ItemDescription key={`description-${item.id}`} text={fullDescription} t={t} dataHl={mark("description")} />}
    </>
  );
}
