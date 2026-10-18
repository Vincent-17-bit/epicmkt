import { offerExpiry, offerValueLabel } from "../lib/itemView.js";
import { formatKes } from "@epicmkt/shared";
import { t } from "../i18n/index.js";
import styles from "./OfferTicket.module.css";

export default function OfferTicket({ view, onSeeItems, level = 4 }) {
  const Heading = `h${level}`;
  const { offer, remainingMs, appliesToLabel } = view;
  const expiry = offerExpiry(remainingMs);
  const notes = [
    offer.conditions?.newCustomersOnly && t("item.newOnly"),
    offer.conditions?.minSpend && `${t("item.minSpend")} ${formatKes(offer.conditions.minSpend)}`
  ].filter(Boolean);

  return (
    <article className={styles.ticket}>
      <div className={styles.value}>{offerValueLabel(offer)}</div>
      <div className={styles.body}>
        <Heading className={styles.title}>{offer.title}</Heading>
        {offer.description && <p className={styles.description}>{offer.description}</p>}
        <p className={styles.meta}>
          <span>{appliesToLabel}</span>
          <span>{expiry ? `${t("item.endsIn")} ${expiry}` : t("item.noLimit")}</span>
          {notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </p>
        {offer.code && (
          <p className={styles.code}>
            {t("item.code")} <strong>{offer.code}</strong>
          </p>
        )}
        {offer.terms && <p className={styles.terms}>{offer.terms}</p>}
        {onSeeItems && (
          <button type="button" className={styles.cta} onClick={() => onSeeItems(offer)}>
            {t("item.seeItems")}
          </button>
        )}
      </div>
    </article>
  );
}
