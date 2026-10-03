import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { countdown } from "../lib/itemView.js";
import { t } from "../i18n/index.js";
import styles from "./FlashBanner.module.css";

export default function FlashBanner({ flash, receivedAt, onExpire }) {
  const endAt = receivedAt + flash.remainingMs;
  const [left, setLeft] = useState(() => Math.max(0, endAt - Date.now()));
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const remaining = Math.max(0, endAt - Date.now());
      setLeft(remaining);
      if (remaining === 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endAt]);

  return (
    <div className={styles.banner} role="group" aria-label={t("item.flash")}>
      <span className={styles.icon}>
        <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>{flash.sale.headline || t("item.flash")}</p>
        {flash.sale.quantityNote && <p className={styles.note}>{flash.sale.quantityNote}</p>}
      </div>
      <p className={styles.timer}>
        <span className={styles.label}>{t("item.endsIn")}</span>
        <time className={styles.clock}>{countdown(left)}</time>
      </p>
    </div>
  );
}
