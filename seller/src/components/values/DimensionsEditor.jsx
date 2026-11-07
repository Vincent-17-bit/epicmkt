import { useId, useState } from "react";
import { DIMENSION_UNITS, SHAPES, dimensionBoxes, previewOf, readDimensions, warningFor } from "./scaleEditing.js";
import { T } from "./text.js";
import { useValueList } from "./useValueList.js";
import ValueChips from "./ValueChips.jsx";
import s from "./values.module.css";

// Sizes with several parts: shape (rectangular or round), boxes labelled for the product type (table Length, Width, Height; sofa Width, Depth,
// Height; door Width, Height; round table Diameter, Height) and a unit. Warns when a number looks wrong (a 750 cm high table) but never blocks.
export default function DimensionsEditor({ values, onChange, typeId = null, label = "Dimensions", hint, disabled = false, defaultUnit = "cm", axisKey = "dimensions" }) {
  const uid = useId();
  const [shape, setShape] = useState("rectangular");
  const [unit, setUnit] = useState(defaultUnit);
  const boxes = dimensionBoxes(typeId, shape);
  const [numbers, setNumbers] = useState({});
  const nums = boxes.map((_, i) => numbers[`${shape}${i}`] ?? "");
  const show = (v) => previewOf(v, { typeId, labels: true });
  const list = useValueList({ values, onChange, show });
  const [tried, setTried] = useState(false);

  const result = nums.every((n) => !n.trim()) ? null : readDimensions({ typeId, shape, unit, numbers: nums });
  const error = result && !result.ok ? result.error.message : "";
  const warn = result?.ok ? warningFor(typeId, axisKey, result.value) : "";
  const previewText = result?.ok ? show(result.value) : "";

  const add = () => {
    const r = readDimensions({ typeId, shape, unit, numbers: nums });
    if (!r.ok) { setTried(true); return; }
    list.addMany([r.value]);
    setNumbers({});
    setTried(false);
  };

  return (
    <fieldset className={s.fieldset} disabled={disabled}>
      <legend className={s.label}>{label}</legend>
      {hint && <p className={s.hint}>{hint}</p>}
      <ValueChips values={values} show={show} onMove={list.move} onRemove={list.remove} disabled={disabled} label={label} />

      <div className={s.seg} role="group" aria-label={T.shape}>
        {SHAPES.map((x) => <button key={x.id} type="button" className={s.segBtn} aria-pressed={shape === x.id} onClick={() => { setShape(x.id); setTried(false); }}>{x.label}</button>)}
      </div>

      <div className={s.rangeGrid}>
        {boxes.map((b, i) => (
          <label key={`${shape}${i}`} className={s.miniLabel}>{T.boxLabel(b.label, unit)}
            <input
              className={s.input}
              inputMode="decimal"
              value={nums[i]}
              aria-describedby={`${uid}-pv`}
              onChange={(e) => setNumbers({ ...numbers, [`${shape}${i}`]: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            />
          </label>
        ))}
        <label className={s.miniLabel}>{T.unit}
          <select className={s.input} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {DIMENSION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>

      <button type="button" className={s.ghost} disabled={!result} aria-label={T.addValueLabel(label)} onClick={add}>{T.addValue}</button>
      {error && <p className={s.error} role={tried ? "alert" : undefined}>{error}</p>}
      <p id={`${uid}-pv`} className={s.preview} aria-live="polite">
        {previewText ? <><span className={s.previewLabel}>{T.previewLabel}:</span> <strong>{previewText}</strong></> : <span className={s.hint}>{T.previewNone}</span>}
      </p>
      {warn && <p className={s.warn} role="status"><strong>{T.checkNumber}</strong> {warn}</p>}
      {list.notice && <p className={s.quiet} role="status">{list.notice}</p>}
      <p className={s.sr} role="status" aria-live="polite">{list.announce}</p>
    </fieldset>
  );
}
