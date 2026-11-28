import { useCallback } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { LazyImage, Skeleton, resizedUrl } from "@epicmkt/ui";
import { formatKes } from "@epicmkt/shared";
import QuantityStepper from "../QuantityStepper.jsx";
import { savedList } from "../../lib/savedList.js";
import { t } from "../../i18n/index.js";
import { fill } from "./model.js";
import { useSaveActions } from "./useSave.js";
import styles from "./SavedLine.module.css";

// One saved line: a compact two-row card. Picture spans both rows; row 1 is the name, the line total and the delete button; row 2 is the option
// (or one status chip) and the compact stepper. The name is the link and stretches over the card (as on a product card), so the stepper and the
// delete button sit above it and never open the item. Never a unit price, never a sum.
export default function SavedLine({ line, loading, goTo }) {
  const { removeLines } = useSaveActions();
  const setQty = useCallback((qty) => savedList().setQty(line.key, qty), [line.key]);
  const gone = line.status === "unavailable";
  const tag = line.chip;
  const go = (e, to) => {
    e.preventDefault();
    goTo(to);
  };
  const similar = `/products?q=${encodeURIComponent(line.name)}`;
  const name = line.link && line.href ? (
    <Link to={line.href} className={styles.nameLink} onClick={(e) => go(e, line.href)}>
      {line.name}
    </Link>
  ) : (
    line.name
  );

  return (
    <li className={styles.line} data-status={line.status} data-testid="saved-line">
      <span className={styles.pic} data-dim={gone ? "true" : undefined}>
        {line.image ? (
          <img src={resizedUrl(line.image, 96)} width={48} height={48} loading="lazy" decoding="async" alt="" className={styles.img} />
        ) : (
          <LazyImage fill src={null} className={styles.img} />
        )}
      </span>

      <span className={styles.name} data-dim={gone ? "true" : undefined}>
        {name}
      </span>

      <span className={styles.end}>
        {loading && !gone ? (
          <Skeleton width="3.5rem" height="0.9rem" />
        ) : line.total !== null ? (
          <span className={styles.price}>{formatKes(line.total)}</span>
        ) : null}
        <button type="button" className={styles.trash} aria-label={fill("saved.removeItem", { name: line.name })} title={t("saved.remove")} onClick={() => removeLines([line.key])}>
          <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
        </button>
      </span>

      <span className={styles.sub}>
        {tag ? (
          <span className={styles.chip} data-tone={tag.tone}>
            {tag.text}
          </span>
        ) : line.note ? (
          <span className={line.status === "choose_options" ? styles.hint : styles.muted}>{line.note}</span>
        ) : line.optionLabel ? (
          <span className={styles.muted}>{line.optionLabel}</span>
        ) : null}
        {gone && (
          <a href={similar} className={styles.action} onClick={(e) => go(e, similar)}>
            {t("saved.findSimilar")}
          </a>
        )}
        {line.status === "option_gone" && line.href && (
          <a href={line.href} className={styles.action} onClick={(e) => go(e, line.href)}>
            {t("saved.chooseAnother")}
          </a>
        )}
      </span>

      <span className={styles.qty}>
        {line.service && !line.rules && !gone ? (
          <span className={styles.muted}>{t("saved.service")}</span>
        ) : line.rules ? (
          <QuantityStepper mode={line.mode} rules={line.rules} value={line.qty} onChange={setQty} size="sm" hints={false} label={fill("saved.qtyOf", { name: line.name })} />
        ) : null}
      </span>
    </li>
  );
}
