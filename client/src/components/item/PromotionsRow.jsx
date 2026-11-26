import { OfferList } from "@epicmkt/ui";
import { dealOf, offerLabels } from "../../lib/offerDeal.js";
import { t } from "../../i18n/index.js";
import styles from "./PromotionsRow.module.css";

/**
 * The offers on the product being viewed. It is the same bar and the same tickets as the store page and the Offers page;
 * only the details differ (what the deal is worth on this product's price, how to get it, a WhatsApp claim).
 */
export default function PromotionsRow({ offers, item, price, onOpenProduct }) {
  if (!offers.length) return null;
  return (
    <section className={styles.row} aria-label={t("item.promotions")}>
      <OfferList offers={offers.map((view) => dealOf(view, { item, price }))} labels={offerLabels()} onOpenItem={onOpenProduct} />
    </section>
  );
}
