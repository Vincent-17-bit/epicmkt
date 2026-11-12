import { SHOE_SYSTEMS } from "../../lib/scaleLabels.js";
import { t } from "../../i18n/index.js";
import styles from "./ShoeSystemSwitch.module.css";

// EU, UK, US men, US women or cm: a segmented radio group (arrow keys move the choice). Shared by the item page and the product filters.
export default function ShoeSystemSwitch({ system, onChange }) {
  const move = (event) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const i = SHOE_SYSTEMS.findIndex((s) => s.id === system);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = SHOE_SYSTEMS[(i + step + SHOE_SYSTEMS.length) % SHOE_SYSTEMS.length].id;
    onChange(next);
    event.currentTarget.querySelector(`[data-system="${next}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t("item.shoeSystem")} className={styles.systems} onKeyDown={move}>
      {SHOE_SYSTEMS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          data-system={s.id}
          aria-checked={system === s.id}
          tabIndex={system === s.id ? 0 : -1}
          className={system === s.id ? `${styles.system} ${styles.systemOn}` : styles.system}
          onClick={() => onChange(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
