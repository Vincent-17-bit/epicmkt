import { useState } from "react";
import { t } from "../i18n/index.js";
import OfferTicket from "./OfferTicket.jsx";
import styles from "./OfferStrip.module.css";

const VISIBLE = 2;

export default function OfferStrip({ offers }) {
  const [all, setAll] = useState(false);
  if (!offers.length) return null;
  const shown = all ? offers : offers.slice(0, VISIBLE);

  return (
    <section className={styles.strip} aria-label={t("item.offers")}>
      <h3 className={styles.title}>{t("item.offers")}</h3>
      <div className={styles.list}>
        {shown.map((view) => (
          <OfferTicket key={view.offer.id} view={view} />
        ))}
      </div>
      {offers.length > VISIBLE && (
        <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t("item.showLess") : `${t("item.seeAllOffers")} ${offers.length}`}
        </button>
      )}
    </section>
  );
}
