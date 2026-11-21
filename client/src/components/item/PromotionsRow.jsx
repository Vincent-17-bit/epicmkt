import { useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { offerLabel } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import OfferTicket from "../OfferTicket.jsx";
import styles from "./PromotionsRow.module.css";

const TAGS = 3;

export default function PromotionsRow({ offers, item, price, onOpenProduct }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const bar = useRef(null);
  if (!offers.length) return null;
  const tags = offers.slice(0, TAGS);
  const rest = offers.length - tags.length;
  const onKeyDown = (event) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
    bar.current?.focus();
  };

  return (
    <section className={styles.row} aria-label={t("item.promotions")} onKeyDown={onKeyDown}>
      <button ref={bar} type="button" className={styles.bar} aria-expanded={open} aria-controls={open ? panel : undefined} onClick={() => setOpen((v) => !v)}>
        <span className={styles.label}>{t("item.promotions")}</span>
        <span className={styles.tags}>
          {tags.map((view) => (
            <span key={view.offer.id} className={styles.tag}>
              {offerLabel(view.offer)}
            </span>
          ))}
          {rest > 0 && <span className={styles.tag}>+{rest}</span>}
        </span>
        <span className={styles.claim}>
          {t("offer.claimNow")}
          <FontAwesomeIcon icon={faChevronDown} className={open ? styles.up : styles.chevron} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div id={panel} className={styles.panel}>
          {offers.map((view) => (
            <OfferTicket key={view.offer.id} view={view} item={item} price={price} onOpenProduct={onOpenProduct} showDates />
          ))}
        </div>
      )}
    </section>
  );
}
