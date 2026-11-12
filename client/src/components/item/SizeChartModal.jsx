import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "@epicmkt/ui";
import { t } from "../../i18n/index.js";
import { canToggleUnit, chartInUnit, matchRow } from "../../lib/chartUnits.js";
import styles from "./SizeChartModal.module.css";

// "Size chart" link + modal. Shown only when the item has a chart (item.sizeChart); the link is hidden otherwise.
// The modal dims the page with the translucent scrim, locks the page scroll, closes on Esc, outside click or Close, and gives focus
// back to the link. A cm / in switch converts the measurement columns; `selected` (the buyer's current size label) is highlighted.
export default function SizeChartLink({ chart, selected = "", extra = null }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const linkRef = useRef(null);
  if (!chart || !Array.isArray(chart.columns) || !Array.isArray(chart.rows) || chart.rows.length === 0) return null;
  return (
    <>
      <button type="button" ref={linkRef} className={styles.link} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true" className={styles.ruler} />
        {t("sizeChart.link")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId} variant="sheet" className={styles.modal}>
        {open && <ChartBody chart={chart} selected={selected} extra={extra} titleId={titleId} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

function ChartBody({ chart, selected, extra, titleId, onClose }) {
  const start = chart.unit === "in" ? "in" : "cm";
  const [unit, setUnit] = useState(start);
  const toggle = canToggleUnit(chart);
  const shown = useMemo(() => (toggle ? chartInUnit(chart, unit) : chart), [chart, unit, toggle]);
  const hit = matchRow(shown, selected);
  const units = ["cm", "in"];

  const onKey = (event) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setUnit(unit === "cm" ? "in" : "cm");
  };

  return (
    <div className={styles.body}>
      <header className={styles.head}>
        <h2 id={titleId} className={styles.title}>{chart.name || t("sizeChart.title")}</h2>
        <button type="button" className={styles.close} onClick={onClose} autoFocus>
          {t("sizeChart.close")}
        </button>
      </header>

      {toggle && (
        <div role="radiogroup" aria-label={t("sizeChart.unit")} className={styles.seg} onKeyDown={onKey}>
          {units.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              tabIndex={unit === u ? 0 : -1}
              className={unit === u ? `${styles.segBtn} ${styles.segOn}` : styles.segBtn}
              onClick={() => setUnit(u)}
            >
              {t(`sizeChart.${u}`)}
            </button>
          ))}
        </div>
      )}

      {chart.overridden && <p className={styles.note}>{t("sizeChart.overridden")}</p>}

      <div className={styles.scroll} tabIndex={0} role="region" aria-label={chart.name || t("sizeChart.title")}>
        <table className={styles.table}>
          <thead>
            <tr>
              {shown.columns.map((c, i) => (
                <th key={i} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((row, r) => (
              <tr key={r} className={r === hit ? styles.hit : undefined} aria-current={r === hit ? "true" : undefined}>
                {row.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row">
                      {cell}
                      {r === hit && <span className={styles.sr}> ({t("sizeChart.rowSelected")})</span>}
                    </th>
                  ) : (
                    <td key={c}>{cell}</td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hit >= 0 && <p className={styles.hint}>{t("sizeChart.rowHint")}</p>}
      {extra}
    </div>
  );
}
