// What a buyer sees: the chart as a table with the cm / in switch. A pure view of one chart object (no data loading), so the editor and the tests
// feed it the same thing. `frame="phone"` shows it at phone width (360 px), `frame="wide"` fills the space.
import { useId, useMemo, useState } from "react";
import { canToggleUnit, chartInUnit } from "@epicmkt/shared";

export function previewChart(chart, unit) {
  const base = { name: chart.name?.trim() || "Untitled chart", unit: chart.unit, columns: chart.columns.map((c) => c.trim()), rows: chart.rows.map((r) => r.map((c) => c.trim())) };
  return canToggleUnit(base) && unit && unit !== base.unit ? chartInUnit(base, unit) : base;
}

export default function ChartPreview({ chart, frame = "phone" }) {
  const base = useMemo(() => ({ unit: chart.unit, columns: chart.columns, rows: chart.rows }), [chart]);
  const toggle = canToggleUnit(base);
  const [pick, setPick] = useState(null);
  const unit = toggle ? (pick ?? chart.unit) : chart.unit;
  const shown = previewChart(chart, unit);
  const id = useId();
  const move = (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    setPick(unit === "cm" ? "in" : "cm");
  };
  return (
    <div className={`sc-preview sc-preview--${frame}`} data-testid="chart-preview">
      <div className="sc-preview__head">
        <h3 id={id} className="sc-preview__title">{shown.name}</h3>
        {toggle && (
          <div role="radiogroup" aria-label="Preview units" className="sc-seg" onKeyDown={move}>
            {["cm", "in"].map((u) => (
              <button key={u} type="button" role="radio" aria-checked={unit === u} tabIndex={unit === u ? 0 : -1} className={unit === u ? "sc-seg__btn sc-seg__btn--on" : "sc-seg__btn"} onClick={() => setPick(u)}>{u}</button>
            ))}
          </div>
        )}
      </div>
      <div className="sc-scroll" data-no-cards role="region" aria-labelledby={id} tabIndex={0}>
        <table className="sc-table">
          <thead><tr>{shown.columns.map((c, i) => <th key={i} scope="col">{c || "…"}</th>)}</tr></thead>
          <tbody>
            {shown.rows.map((row, r) => (
              <tr key={r}>{row.map((cell, c) => (c === 0 ? <th key={c} scope="row">{cell}</th> : <td key={c}>{cell}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
