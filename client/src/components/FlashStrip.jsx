import { memo } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBolt } from "@fortawesome/free-solid-svg-icons";
import { useFlashStrip } from "../hooks/useFlashSales.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { t } from "../i18n/index.js";
import FlashSaleCard from "./FlashSaleCard.jsx";
import FlashSkeleton from "./FlashSkeleton.jsx";
import HeatSection from "./HeatSection.jsx";
import HScroller from "./HScroller.jsx";
import styles from "./FlashStrip.module.css";

const nearestOf = (entries) => entries.reduce((best, e) => (!best || Date.parse(e.sale.endsAt) < Date.parse(best) ? e.sale.endsAt : best), null);

function SeeAllTile({ to }) {
  return (
    <Link to={to} className={styles.tile} data-tile="" draggable="false">
      <FontAwesomeIcon icon={faBolt} className={styles.tileBolt} aria-hidden="true" />
      <span>{t("flash.seeAllTile")}</span>
      <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
    </Link>
  );
}

function FlashStrip({ id = "flash-strip", businessId = null, categoryId = null, heat = true, heading = null }) {
  const { entries, isPending, isError, refetch } = useFlashStrip({ businessId, categoryId });
  const desktop = useMediaQuery("(min-width: 1024px)");
  const seeAll = categoryId ? `/flash?category=${encodeURIComponent(categoryId)}` : "/flash";

  if (!isPending && !isError && entries.length === 0) return null;

  const body = isError ? (
    <div className={styles.error} role="alert">
      <p>{t("flash.loadFailed")}</p>
      <button type="button" className={styles.retry} onClick={() => refetch()}>
        {t("flash.retry")}
      </button>
    </div>
  ) : (
    <HScroller leftLabel={t("flash.scrollLeft")} rightLabel={t("flash.scrollRight")} busy={isPending}>
      {isPending
        ? Array.from({ length: 4 }, (_, index) => <FlashSkeleton key={index} />)
        : [
            ...entries.map((entry, index) => (
              <FlashSaleCard key={entry.sale.id} entry={entry} size={desktop && index === 0 && heat ? "hero" : "standard"} data-wide={desktop && index === 0 && heat ? "true" : undefined} />
            )),
            <SeeAllTile key="all" to={seeAll} />
          ]}
    </HScroller>
  );

  if (!heat) {
    return (
      <section className={styles.plain} aria-labelledby={id}>
        <h3 id={id} className={styles.plainTitle}>
          <FontAwesomeIcon icon={faBolt} className={styles.plainBolt} aria-hidden="true" />
          {heading ?? t("flash.atStore")}
        </h3>
        {body}
      </section>
    );
  }

  return (
    <HeatSection id={id} nearestEndsAt={isPending ? null : nearestOf(entries)} seeAllTo={seeAll}>
      {body}
    </HeatSection>
  );
}

export default memo(FlashStrip);
