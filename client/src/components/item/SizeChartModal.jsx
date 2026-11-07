import { useEffect, useId, useState } from "react";
import { Modal } from "@epicmkt/ui";
import { t } from "../../i18n/index.js";
import { canToggleUnit, chartInUnit } from "../../lib/sizeChartUnits.js";
import styles from "./SizeChartModal.module.css";

// Locks the page behind the dialog. A native <dialog> does not stop the page scrolling under it on every browser, so the body is
// frozen while it is open and put back exactly as it was.
function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`; // no jump when the scrollbar disappears
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [locked]);
}

/** The chart table. `chart` is the item's sizeChart ({name, unit, columns, rows, overridden}); `extra` is rendered under the table (the shoe
 *  conversion). Closing is the parent's job (onClose); the dialog closes on Esc, on a click outside, and on the Close button. */
export default function SizeChartModal({ chart, open, onClose, extra = null }) {
  const titleId = useId();
  const [unit, setUnit] = useState(chart?.unit === "in" ? "in" : "cm");
  useScrollLock(open);
  useEffect(() => { if (open) setUnit(chart?.unit === "in" ? "in" : "cm"); }, [open, chart?.unit]);
  if (!chart) return null;

  const toggle = canToggleUnit(chart);
  const view = chartInUnit(chart, unit);

  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId} className={styles.dialog}>
      <div className={styles.sheet}>
        <header className={styles.head}>
          <div className={styles.titles}>
            <h2 id={titleId} className={styles.title}>{t("sizeChart.title")}</h2>
            <p className={styles.name}>
              {chart.name}
              {chart.overridden && <span className={styles.badge}>{t("sizeChart.custom")}</span>}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("sizeChart.close")}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
          </button>
        </header>

        <div className={styles.body}>
          {toggle && (
            <div className={styles.units} role="group" aria-label={t("sizeChart.units")}>
              {["cm", "in"].map((u) => (
                <button key={u} type="button" className={styles.unit} aria-pressed={unit === u} onClick={() => setUnit(u)}>
                  {t(`sizeChart.${u}`)}
                </button>
              ))}
            </div>
          )}

          <div className={styles.scroll} tabIndex={0} role="region" aria-label={chart.name}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>{chart.name} ({view.unit})</caption>
              <thead>
                <tr>{view.columns.map((c, i) => <th key={`${c}-${i}`} scope="col">{c}</th>)}</tr>
              </thead>
              <tbody>
                {view.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {extra}
          <p className={styles.note}>{t("sizeChart.note")}</p>
        </div>
      </div>
    </Modal>
  );
}
