import { useState } from "react";
import { chartInUnit, canToggleUnit, guideForBuyer, matchRow } from "@epicmkt/shared";
import s from "./guide.module.css";

// How the table looks to a buyer: the same columns and rows, in cm or inches, with the size they pick highlighted.
export default function BuyerPreview({ guide }) {
  const chart = guideForBuyer(guide);
  const [unit, setUnit] = useState(null);
  const [pick, setPick] = useState(0);
  if (!chart) return <p className={s.muted}>Add at least one size and your table shows here the way buyers see it.</p>;
  const shown = unit && unit !== chart.unit ? chartInUnit(chart, unit) : chart;
  const toggle = canToggleUnit(chart);
  const hit = matchRow(shown, chart.rows[pick]?.[0]);
  return (
    <div className={s.preview} data-testid="guide-preview">
      <div className={s.previewTop}>
        <p className={s.previewTitle}>How buyers see it</p>
        {toggle && (
          <div role="radiogroup" aria-label="Show measurements in" className={s.seg}>
            {["cm", "in"].map((u) => (
              <button key={u} type="button" role="radio" aria-checked={(unit ?? chart.unit) === u} className={s.segBtn} onClick={() => setUnit(u)}>{u === "cm" ? "cm" : "inches"}</button>
            ))}
          </div>
        )}
      </div>
      <label className={s.pickRow}>
        <span>If a buyer picks</span>
        <select value={pick} onChange={(e) => setPick(Number(e.target.value))} className={s.pickSelect}>
          {chart.rows.map((r, i) => <option key={i} value={i}>{r[0]}</option>)}
        </select>
      </label>
      <div className={s.scroll} tabIndex={0} role="region" aria-label="Preview of your size guide">
        <table className={`${s.table} ${s.readTable}`}>
          <caption className={s.sr}>Size guide preview</caption>
          <thead><tr>{shown.columns.map((c, i) => <th key={i} scope="col" className={`${s.rth} ${i === 0 ? s.stick : ""}`}>{c}</th>)}</tr></thead>
          <tbody>
            {shown.rows.map((r, ri) => (
              <tr key={ri} data-hit={ri === hit ? "" : undefined}>
                {r.map((c, ci) => ci === 0 ? <th key={ci} scope="row" className={`${s.rtd} ${s.stick}`}>{c}</th> : <td key={ci} className={s.rtd}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
