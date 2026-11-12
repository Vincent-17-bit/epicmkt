import { useId, useState } from "react";
import { T } from "./text.js";
import { addMany, rangeRaws } from "./model.js";
import s from "./scale.module.css";

/**
 * Quick adds under a scale editor: preset buttons ("XS to XL") and a from / to / step range ("EU 38 to 47 in half steps").
 * `config` is the scale's entry in scaleEditorConfig (presets, range). `onAdd(raws, ctx)` adds many raw values; it returns { added, merged }.
 * `systems` (shoe) lets the range follow a size system; `system` is the one currently chosen.
 */
export default function QuickPicks({ config, values, scaleId, ctx, systems, system, onAdd, disabled }) {
  const uid = useId();
  const range = config.range;
  const [from, setFrom] = useState(String(range?.defaults?.from ?? ""));
  const [to, setTo] = useState(String(range?.defaults?.to ?? ""));
  const [step, setStep] = useState(String(range?.defaults?.step ?? ""));
  const [suffix, setSuffix] = useState(range?.options?.[0]?.raw ?? "");
  if (!config.presets?.length && !range) return null;

  const built = range ? rangeRaws({ from, to, step, suffix: range.bySystem ? "" : suffix }) : null;
  const ready = built?.ok;
  const room = Math.max(0, 40 - values.length);
  const rangeCtx = range?.bySystem && system ? { ...ctx, system } : ctx;

  return (
    <section className={s.range} aria-labelledby={`${uid}-t`} data-testid="quick-picks">
      <h4 id={`${uid}-t`} className={s.label}>{T.quickAdd}</h4>
      {config.presets?.length > 0 && (
        <div className={s.choices}>
          {config.presets.map((p) => <button key={p.id} type="button" className={s.pick} disabled={disabled || room === 0} onClick={() => onAdd(p.raws, ctx)}>{T.presetNote(p.label)}</button>)}
        </div>
      )}
      {range && (
        <fieldset className={s.choices} style={{ display: "grid" }}>
          <legend className={s.label}>{T.rangeTitle}{range.label ? ` (${range.label})` : ""}</legend>
          <div className={s.rangeRow}>
            <label className={s.field}>{T.rangeFrom}<input className={s.input} inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className={s.field}>{T.rangeTo}<input className={s.input} inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className={s.field}>{T.rangeStep}<input className={s.input} inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} /></label>
            {range.options && (
              <label className={s.field}>{T.rangeUnit}
                <select className={s.select} value={suffix} onChange={(e) => setSuffix(e.target.value)}>
                  {range.options.map((o) => <option key={o.id} value={o.raw}>{o.label}</option>)}
                </select>
              </label>
            )}
            {range.bySystem && systems && <span className={s.hint}>{systems.find((x) => x.id === system)?.label ?? ""}</span>}
            <button type="button" className={s.button} disabled={disabled || !ready} onClick={() => onAdd(built.raws, rangeCtx)}>{T.rangeAdd}</button>
          </div>
          <p className={built && !ready ? s.error : s.hint} role={built && !ready ? "alert" : undefined}>{ready ? T.rangePreview(Math.min(built.raws.length, room)) : built?.message}</p>
        </fieldset>
      )}
    </section>
  );
}
export { addMany };
