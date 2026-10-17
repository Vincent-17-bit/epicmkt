import { memo } from "react";
import { useCountdown } from "../hooks/useCountdown.js";
import { clockText, pad2, showsDays } from "../lib/flash.js";
import { t } from "../i18n/index.js";
import styles from "./CountdownTiles.module.css";

function Digits({ text }) {
  return (
    <span className={styles.digits}>
      {[...text].map((char, index) => (
        <span key={index} className={styles.digit}>
          {char}
        </span>
      ))}
    </span>
  );
}

function CountdownTiles({ endsAt, variant = "card", className = "" }) {
  const parts = useCountdown(endsAt);
  const urgency = parts.urgency;

  if (variant === "chip" || variant === "inline") {
    return (
      <span className={`${styles[variant]} ${className}`} data-urgency={urgency} aria-hidden="true">
        <Digits text={clockText(parts)} />
      </span>
    );
  }

  const days = showsDays(parts);
  const units = days
    ? [
        [parts.d, t("flash.days")],
        [parts.h, t("flash.hours")],
        [parts.m, t("flash.min")]
      ]
    : [
        [parts.h, t("flash.hours")],
        [parts.m, t("flash.min")],
        [parts.s, t("flash.sec")]
      ];

  return (
    <span className={`${styles.tiles} ${styles[variant]} ${className}`} data-urgency={urgency} aria-hidden="true">
      {units.map(([value, label], index) => (
        <span key={label} className={styles.group}>
          {index > 0 && <span className={styles.colon}>:</span>}
          <span className={styles.tile}>
            <Digits text={pad2(value)} />
            <span className={styles.unit}>{label}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

export default memo(CountdownTiles);
