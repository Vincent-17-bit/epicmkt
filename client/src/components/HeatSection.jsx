import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBolt } from "@fortawesome/free-solid-svg-icons";
import { t } from "../i18n/index.js";
import CountdownTiles from "./CountdownTiles.jsx";
import styles from "./HeatSection.module.css";

export default function HeatSection({ id, nearestEndsAt = null, count = null, seeAllTo = "/flash", children, as: Tag = "section" }) {
  return (
    <Tag className={styles.panel} aria-labelledby={id}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={id} className={styles.title}>
            <FontAwesomeIcon icon={faBolt} className={styles.bolt} aria-hidden="true" />
            {t("flash.title")}
            {count !== null && <span className={styles.count}>{count} {t("flash.count")}</span>}
          </h2>
          <span className={styles.underline} aria-hidden="true" />
        </div>
        <div className={styles.side}>
          {nearestEndsAt && (
            <span className={styles.master}>
              <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
              {t("flash.endsSoonest")}
              <CountdownTiles endsAt={nearestEndsAt} variant="chip" />
            </span>
          )}
          <Link to={seeAllTo} className={styles.seeAll}>
            {t("flash.seeAll")}
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {children}
    </Tag>
  );
}
