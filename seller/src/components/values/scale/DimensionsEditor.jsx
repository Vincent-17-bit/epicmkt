import { useId, useMemo, useState } from "react";
import { scales } from "@epicmkt/shared";
import ScaleValuesEditor from "./ScaleValuesEditor.jsx";
import { add } from "./model.js";
import { T } from "./text.js";
import s from "./scale.module.css";

export const DIMENSION_UNITS = [{ id: "cm", label: "cm" }, { id: "m", label: "m" }, { id: "in", label: "in" }, { id: "ft", label: "ft" }];
const SHAPES = [{ id: "rectangular", label: T.rectangular }, { id: "round", label: T.round }];

const numeric = (t) => /^\s*\d+(?:[.,]\d+)?\s*$/.test(t);
/** "120 x 75 x 75 cm" (or "Ø90 x 75 cm" for round) from the typed numbers. Returns null until every field is a number. */
export function rawFromFields(fields, unit, shape) {
  if (!fields.length || !fields.every(numeric)) return null;
  const body = fields.map((f) => f.trim().replace(",", ".")).join(" x ");
  return `${shape === "round" ? "round " : ""}${body} ${unit}`;
}

/**
 * The labelled number fields for one size: Length x Width x Height for a table, Width x Depth x Height for a sofa,
 * Width x Height for a door, Diameter x Height for a round table (labels come from the shared dimension profiles).
 * onSubmit(storedValue) gets a value already read by the shared parse. An unusual size warns, and never blocks.
 */
export function DimensionForm({ typeId, axisKey = "dimensions", legend, defaultUnit = "cm", defaultShape = "rectangular", allowRound = true, submitLabel = T.dimsAdd, onSubmit, resetOnSubmit = true }) {
  const uid = useId();
  const [shape, setShape] = useState(defaultShape);
  const [unit, setUnit] = useState(defaultUnit);
  const labels = useMemo(() => scales.dimensionLabels(typeId, shape), [typeId, shape]);
  const [fields, setFields] = useState(() => labels.map(() => ""));
  const [error, setError] = useState("");
  const values = fields.slice(0, labels.length);
  const raw = rawFromFields(values, unit, shape);
  const parsed = raw ? scales.parse("dimensions", raw) : null;
  const check = parsed?.ok ? scales.plausible(typeId, axisKey, parsed.value) : null;

  const changeShape = (id) => { setShape(id); setFields(scales.dimensionLabels(typeId, id).map(() => "")); setError(""); };
  const submit = (e) => {
    e.preventDefault();
    if (!raw) { setError(T.dimsFill(labels.join(", ").toLowerCase())); return; }
    if (!parsed.ok) { setError(parsed.error.message); return; }
    if (check && !check.ok) { setError(check.warn); return; }
    setError("");
    onSubmit(parsed.value);
    if (resetOnSubmit) setFields(labels.map(() => ""));
  };

  return (
    <form className={s.range} onSubmit={submit} aria-label={legend ?? T.dimsAdd} noValidate>
      {allowRound && (
        <fieldset className={s.choices}>
          <legend>{T.shape}</legend>
          {SHAPES.map((o) => <button key={o.id} type="button" className={s.pick} aria-pressed={shape === o.id} onClick={() => changeShape(o.id)}>{o.label}</button>)}
        </fieldset>
      )}
      <div className={s.rangeRow}>
        {labels.map((name, i) => (
          <label key={`${shape}-${name}`} className={s.field}>
            {name}
            <input className={s.input} inputMode="decimal" autoComplete="off" value={fields[i] ?? ""} aria-invalid={error ? "true" : undefined}
              onChange={(e) => { setFields((f) => f.map((x, k) => (k === i ? e.target.value : x))); setError(""); }} />
          </label>
        ))}
        <label className={s.field} htmlFor={`${uid}-u`}>{T.unit}
          <select id={`${uid}-u`} className={s.select} value={unit} onChange={(e) => setUnit(e.target.value)}>
            {DIMENSION_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        <button type="submit" className={`${s.button} ${s.primary}`}>{submitLabel}</button>
      </div>
      {parsed?.ok && <p className={s.preview}><span className={s.previewLabel}>{T.dimsPreview}: </span><strong>{scales.format(parsed.value)}</strong></p>}
      {check?.warn && check.ok && <p className={s.warn} role="status">{check.warn}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}
    </form>
  );
}

/** A list of sizes (table: L x W x H) the seller adds with labelled fields or types as text ("120 x 75 x 75 cm"). */
export default function DimensionsEditor({ typeId, label = "Sizes", values, onChange, axisKey = "dimensions", ...rest }) {
  const [shape] = useState("rectangular");
  return (
    <ScaleValuesEditor {...rest} scaleId="dimensions" label={label} values={values} onChange={onChange} ctx={{ shape }} typeId={typeId} axisKey={axisKey}
      hint="Type 120 x 75 x 75 cm, or use the fields below.">
      <DimensionForm typeId={typeId} axisKey={axisKey} onSubmit={(v) => { const r = add(values, v, { scaleId: "dimensions" }); if (r.ok && !r.merged) onChange(r.list); }} />
    </ScaleValuesEditor>
  );
}

/**
 * Dimensions per option (a sofa's 2-, 3- and 4-seater each have their own Width x Depth x Height).
 * options: [{ id, label }]; value: { [optionId]: storedDimensions }; onChange(nextValue).
 */
export function OptionDimensionsEditor({ typeId, options, value, onChange, axisKey = "dimensions", legend = "Dimensions for each option" }) {
  if (!options.length) return <p className={s.hint}>{T.noOptions}</p>;
  return (
    <div className={s.wrap} role="group" aria-label={legend}>
      {options.map((o) => (
        <section key={o.id} className={s.wrap} aria-label={T.optionDims(o.label)} data-testid="option-dimensions">
          <h4 className={s.label}>{o.label}{value?.[o.id] && <span className={s.previewLabel}> · {scales.format(value[o.id])}</span>}</h4>
          <DimensionForm typeId={typeId} axisKey={axisKey} legend={T.optionDims(o.label)} allowRound={false} submitLabel={value?.[o.id] ? "Update" : "Set dimensions"} resetOnSubmit={false}
            onSubmit={(v) => onChange({ ...value, [o.id]: v })} />
        </section>
      ))}
    </div>
  );
}
