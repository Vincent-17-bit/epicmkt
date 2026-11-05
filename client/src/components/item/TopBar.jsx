import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { t } from "../../i18n/index.js";
import styles from "../ItemDetail.module.css";

// The breadcrumb trail and, in the sheet layout, the close button.
export default function TopBar({ ctx }) {
  const { item, business, isPage, vanished, onClose } = ctx;
  return (
    <header className={styles.header}>
      <nav aria-label={t("item.back")} className={styles.trail}>
        <ol className={styles.list}>
          <li className={styles.crumb}>
            <button type="button" className={styles.parent} onClick={onClose}>
              <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
              <span className={styles.parentName}>{business.name}</span>
            </button>
          </li>
          <li className={styles.crumb}>
            <FontAwesomeIcon icon={faChevronRight} className={styles.sep} aria-hidden="true" />
            <span className={styles.current} aria-current="page">
              {item ? item.name : vanished ? t("breadcrumbs.itemUnavailable") : ""}
            </span>
          </li>
        </ol>
      </nav>
      {!isPage && (
        <button type="button" className={styles.close} onClick={onClose} aria-label={t("item.close")}>
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
