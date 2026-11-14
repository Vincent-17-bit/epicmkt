import { useId, useMemo, useRef, useState } from "react";
import { Modal } from "@epicmkt/ui";
import { rowForLabel } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import { canToggleUnit, chartInUnit, matchRow } from "../../lib/chartUnits.js";
import styles from "./SizeChartModal.module.css";

// "Size chart" link + modal. Shown only when the item has a chart (item.sizeChart); the link is hidden otherwise.
// The modal dims the page with the translucent scrim, locks the page scroll, closes on Esc, outside click or Close, and gives focus
// back to the link. A cm / in switch converts the measurement columns; `selected` (the buyer's current size label) is highlighted.
//
// Inside: a row of size chips (each with its photo when the seller added one), a detail card for the chip chosen (photo, then every
// measurement as "label, value"), a button that picks that size on the item page, and the whole chart as a table to compare.
//   photoFor(row)  the photo url of a guide row, or null     pickable(row) / onPick(row)  can this row be chosen on the page, and do it
export default function SizeChartLink({ chart, selected = "", extra = null, photoFor = null, pickable = null, onPick = null }) {
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
        {open && <ChartBody chart={chart} selected={selected} extra={extra} titleId={titleId} onClose={() => setOpen(false)} photoFor={photoFor} pickable={pickable} onPick={onPick} />}
      </Modal>
    </>
  );
}

const EMPTY = /^[\s\-–—]*$/;
// "weight (g)" -> "Weight (g)": the seller's wording, with a capital letter.
const headerText = (c) => { const x = String(c ?? "").trim(); return x ? x[0].toUpperCase() + x.slice(1) : x; };
const rowName = (cell) => { const x = String(cell ?? "").trim(); return x ? x[0].toUpperCase() + x.slice(1) : x; };

function ChartBody({ chart, selected, extra, titleId, onClose, photoFor, pickable, onPick }) {
  const start = chart.unit === "in" ? "in" : "cm";
  const [unit, setUnit] = useState(start);
  const toggle = canToggleUnit(chart);
  const shown = useMemo(() => (toggle ? chartInUnit(chart, unit) : chart), [chart, unit, toggle]);
  // The buyer's own size: the row named like it, else a row that carries it in another column ("700g").
  const hit = useMemo(() => { const named = matchRow(shown, selected); return named >= 0 ? named : rowForLabel(shown.rows, selected); }, [shown, selected]);
  const [chosen, setChosen] = useState(null);
  const active = chosen !== null && chosen < shown.rows.length ? chosen : hit >= 0 ? hit : 0;
  const units = ["cm", "in"];
  const row = shown.rows[active] ?? [];
  const photo = photoFor ? photoFor(row) : null;
  const specs = row.map((cell, i) => ({ label: headerText(shown.columns[i]), cell })).filter((x, i) => i > 0 && !EMPTY.test(String(x.cell ?? "")));
  const canPick = Boolean(onPick) && (!pickable || pickable(row)) && active !== hit;
  const anyPhoto = Boolean(photoFor) && shown.rows.some((r) => photoFor(r));

  const onKey = (event) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setUnit(unit === "cm" ? "in" : "cm");
  };

  return (
    <div className={styles.body}>
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>{chart.name || t("sizeChart.title")}</h2>
          <p className={styles.sub}>{t("sizeChart.subtitle")}</p>
        </div>
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

      {shown.rows.length > 1 && (
        <ul className={styles.chips} aria-label={t("sizeChart.pickLabel")}>
          {shown.rows.map((r, i) => {
            const url = photoFor ? photoFor(r) : null;
            return (
              <li key={i}>
                <button type="button" className={styles.chip} aria-pressed={i === active} data-mine={i === hit ? "" : undefined} data-photo={anyPhoto ? "" : undefined} onClick={() => setChosen(i)}>
                  {anyPhoto && (url ? <img className={styles.chipImg} src={url} alt="" loading="lazy" /> : <span className={styles.chipImg} data-empty="" aria-hidden="true" />)}
                  <span className={styles.chipName}>{rowName(r[0])}</span>
                  {i === hit && <span className={styles.chipTag}>{t("sizeChart.yours")}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <section className={styles.detail} aria-live="polite" aria-label={rowName(row[0])} data-photo={photo ? "" : undefined}>
        {photo && <img className={styles.detailImg} src={photo} alt={`${rowName(row[0])}`} />}
        <div className={styles.detailText}>
          <h3 className={styles.detailName}>{rowName(row[0])}</h3>
          {specs.length > 0 ? (
            <dl className={styles.specs}>
              {specs.map((x) => (
                <div key={x.label} className={styles.spec}>
                  <dt>{x.label}</dt>
                  <dd>{x.cell}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className={styles.note}>{t("sizeChart.noDetails")}</p>
          )}
          {canPick && (
            <button type="button" className={styles.use} onClick={() => { onPick(row); onClose(); }}>
              {t("sizeChart.choose")} {rowName(row[0])}
            </button>
          )}
        </div>
      </section>

      <h3 className={styles.compare}>{t("sizeChart.compare")}</h3>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label={chart.name || t("sizeChart.title")}>
        <table className={styles.table}>
          <thead>
            <tr>
              {shown.columns.map((c, i) => (
                <th key={i} scope="col">{headerText(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.rows.map((r, ri) => (
              <tr key={ri} className={ri === hit ? styles.hit : undefined} data-active={ri === active ? "" : undefined} aria-current={ri === hit ? "true" : undefined}>
                {r.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row">
                      {rowName(cell)}
                      {ri === hit && <span className={styles.sr}> ({t("sizeChart.rowSelected")})</span>}
                    </th>
                  ) : (
                    <td key={c}>{EMPTY.test(String(cell ?? "")) ? <span aria-label={t("sizeChart.none")}>–</span> : cell}</td>
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
