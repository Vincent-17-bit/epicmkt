import { t } from "../../i18n/index.js";
import Heart from "../saved/Heart.jsx";
import { useItemSave } from "./useItemSave.js";
import detail from "../ItemDetail.module.css";
import styles from "./SaveItem.module.css";

// Save, in the sticky footer: a square icon button below 480 px, with the word from 480 px. Chat with seller stays the primary button.
// `icon` is the order footer (chat and visit are icon buttons there): Save joins them, in the same style.
export function FooterSave({ ctx, icon = false }) {
  const s = useItemSave(ctx);
  if (!s) return null;
  if (icon) {
    return (
      <button type="button" className={detail.iconBtn} aria-pressed={s.saved} aria-label={s.label} onClick={s.toggle} data-testid="save-footer">
        <Heart filled={s.saved} size={20} />
        <span className={detail.iconLabel} aria-hidden="true">{s.saved ? t("saved.itemSaved") : t("saved.itemSave")}</span>
      </button>
    );
  }
  return (
    <button type="button" className={styles.footerBtn} aria-pressed={s.saved} aria-label={s.label} onClick={s.toggle} data-testid="save-footer">
      <Heart filled={s.saved} />
      <span className={styles.word}>{s.saved ? t("saved.itemSaved") : t("saved.itemSave")}</span>
    </button>
  );
}

// Save, in the seller card, beside Share and Report price.
export function CardSave({ ctx, className }) {
  const s = useItemSave(ctx);
  if (!s) return null;
  return (
    <button type="button" className={className} aria-pressed={s.saved} aria-label={s.label} onClick={s.toggle} data-testid="save-card">
      <Heart filled={s.saved} size={16} />
      <span>{s.saved ? t("saved.itemSaved") : t("saved.itemSave")}</span>
    </button>
  );
}
