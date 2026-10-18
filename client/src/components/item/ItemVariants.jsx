import { useRef } from "react";
import { kesText } from "../../lib/flash.js";
import { t } from "../../i18n/index.js";
import styles from "./item.module.css";

export default function ItemVariants({ variants, activeId, onChange, showPrice }) {
  const refs = useRef([]);
  const index = Math.max(0, variants.findIndex((v) => v.id === activeId));

  const move = (next) => {
    const target = (next + variants.length) % variants.length;
    onChange(variants[target].id);
    refs.current[target]?.focus();
  };

  const onKeyDown = (event) => {
    const focused = refs.current.indexOf(document.activeElement);
    const from = focused >= 0 ? focused : index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") move(from + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(from - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(variants.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div role="radiogroup" aria-label={t("item.options")} className={styles.variants} onKeyDown={onKeyDown}>
      {variants.map((variant, i) => {
        const selected = variant.id === activeId;
        return (
          <button
            key={variant.id}
            ref={(node) => {
              refs.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === index ? 0 : -1}
            className={`${styles.variant} ${selected ? styles.selected : ""}`}
            onClick={() => onChange(variant.id)}
          >
            <span>{variant.label}</span>
            {showPrice && Number.isFinite(variant.salePrice) && <span className={styles.variantPrice}>{kesText(variant.salePrice)}</span>}
          </button>
        );
      })}
    </div>
  );
}
