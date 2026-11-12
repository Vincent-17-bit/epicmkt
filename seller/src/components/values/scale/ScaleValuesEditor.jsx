import { useId, useRef, useState } from "react";
import { scales } from "@epicmkt/shared";
import { T } from "./text.js";
import { UNIT_NAMES, configFor } from "./scaleEditorConfig.js";
import QuickPicks from "./QuickPicks.jsx";
import { MAX_VALUES, add, addMany, checks, inspect, isSorted, labels, move, moveTo, remove, sorted } from "./model.js";
import s from "./scale.module.css";

/**
 * One axis's values for any scale: typed text is read by the shared `parse`, shown by `format`, kept in the seller's order,
 * and the same size typed twice is kept once (by sizeKey) with a quiet notice. Stored values are `{scale, system?, value, unit?, ...}`, never bare text.
 *
 * <ScaleValuesEditor scaleId="volume" label="Size" values={list} onChange={setList} typeId="drinking-water" axisKey="size" />
 *
 * Props: scaleId, label, values, onChange(list), ctx (parse context: system, defaultUnit, ...), typeId + axisKey (plausibility),
 * hint, required, disabled, suffix (words added to every typed or quick-added value, e.g. "wide"), systems + system (shoe), chipNote(value) -> text shown in a chip, children (extra controls placed under the input, such as a range picker), validate(value) -> { ok, warn? } extra check.
 */
export default function ScaleValuesEditor({ scaleId, label, values, onChange, ctx = {}, typeId, axisKey, hint, required = false, disabled = false, suffix = "", systems, system, chipNote, children }) {
  const uid = useId();
  const inputRef = useRef(null);
  const config = configFor(scaleId);
  const scale = scales.getScale(scaleId);
  const [raw, setRaw] = useState("");
  const [shownError, setShownError] = useState(null); // { error, raw } after a failed Add
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState(null); // index being dragged
  const [over, setOver] = useState(null);

  const withSuffix = (t) => (suffix ? `${t.trim()} ${suffix}` : t);
  const live = inspect(withSuffix(raw), { scaleId, ctx });
  const full = values.length >= MAX_VALUES;
  const notes = checks(values, typeId, axisKey);
  const noteAt = (i) => notes.find((n) => n.index === i);
  const hintText = hint ?? (config.hint ? T.hint(config.hint) : "");
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const previewId = `${uid}-preview`;
  const error = shownError && shownError.raw === raw ? shownError.error : null;

  const say = (text) => setNotice(text);
  const focusInput = () => inputRef.current?.focus();

  function commit(text, useCtx = ctx) {
    const r = add(values, withSuffix(text), { scaleId, ctx: useCtx });
    if (!r.ok) { setShownError({ error: r.error, raw: text }); say(r.error.message); return; }
    setShownError(null);
    setRaw("");
    if (r.merged) say(T.merged(text.trim(), scales.format(r.into)));
    else { onChange(r.list); say(T.addedOne(scales.format(r.added))); }
    focusInput();
  }

  function quickAdd(raws, useCtx) {
    const r = addMany(values, raws.map(withSuffix), { scaleId, ctx: useCtx });
    if (r.added) onChange(r.list);
    const parts = [r.added ? T.addedMany(r.added) : "", r.merged ? T.mergedMany(r.merged) : "", r.errors[0]?.error.message ?? ""].filter(Boolean);
    say(parts.join(" "));
  }

  const submit = (e) => { e?.preventDefault?.(); if (!disabled && raw.trim()) commit(raw); };
  const onKey = (e) => { if (e.key === "Enter") submit(e); };

  // A value that needs one more word: a unit ("20" litres) or a size system ("42" EU).
  const needs = error?.needs;
  const unitOptions = needs === "unit" ? (error.options ?? scale?.units ?? []) : [];
  const systemOptions = needs === "system" ? (scale?.systems ?? []).filter((x) => !error.options || error.options.includes(x.id)) : [];

  function changeAt(next, message) { onChange(next); say(message); }

  const showPreview = values.length > 0;

  return (
    <div className={s.wrap} data-testid={`scale-editor-${scaleId}`}>
      <label className={s.label} htmlFor={`${uid}-input`}>{label}{required && <span className={s.req}> (required)</span>}</label>
      <div className={s.row}>
        <input
          id={`${uid}-input`}
          ref={inputRef}
          className={s.input}
          type="text"
          inputMode="text"
          autoComplete="off"
          enterKeyHint="done"
          value={raw}
          disabled={disabled || full}
          placeholder={config.examples ? `e.g. ${config.examples}` : undefined}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={[hintText && hintId, error && errorId, live.state === "ok" && previewId].filter(Boolean).join(" ") || undefined}
          onChange={(e) => { setRaw(e.target.value); setShownError(null); }}
          onKeyDown={onKey}
        />
        <button type="button" className={`${s.button} ${s.primary}`} disabled={disabled || full || !raw.trim()} onClick={submit}>{T.add}</button>
      </div>

      {hintText && <p id={hintId} className={s.hint}>{hintText}</p>}
      {live.state === "ok" && !error && <p id={previewId} className={s.preview}><span className={s.previewLabel}>{T.preview}: </span><strong>{live.label}</strong></p>}
      {error && <p id={errorId} className={s.error} role="alert">{error.message}</p>}

      {unitOptions.length > 0 && (
        <fieldset className={s.choices}>
          <legend>{T.needsUnit(raw.trim())}</legend>
          {unitOptions.map((u) => <button key={u} type="button" className={s.pick} onClick={() => commit(`${raw.trim()} ${u}`)}>{UNIT_NAMES[u] ?? u}</button>)}
        </fieldset>
      )}
      {systemOptions.length > 0 && (
        <fieldset className={s.choices}>
          <legend>{T.needsSystem(raw.trim())}</legend>
          {systemOptions.map((o) => <button key={o.id} type="button" className={s.pick} onClick={() => commit(raw.trim(), { ...ctx, system: o.id })}>{o.label}</button>)}
        </fieldset>
      )}

      <QuickPicks config={config} values={values} scaleId={scaleId} ctx={ctx} systems={systems} system={system} onAdd={quickAdd} disabled={disabled} />
      {children}

      <div role="group" aria-label={T.listLabel(label)} className={s.wrap}>
        {values.length === 0 ? <p className={s.hint}>{T.empty}</p> : (
          <ul className={s.list}>
            {values.map((v, i) => {
              const name = scales.format(v);
              const note = noteAt(i);
              return (
                <li
                  key={`${scales.sizeKey(v)}|${v.width ?? ""}`}
                  className={`${s.chip} ${note ? s.chipWarn : ""} ${drag === i ? s.dragging : ""} ${over === i && drag !== null && drag !== i ? s.dropHere : ""}`}
                  data-testid="scale-chip"
                  draggable={!disabled && values.length > 1}
                  onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", name); }}
                  onDragOver={(e) => { if (drag !== null) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(i); } }}
                  onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) changeAt(moveTo(values, drag, i), T.moved(scales.format(values[drag]), i + 1, values.length)); setDrag(null); setOver(null); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                >
                  <span className={s.chipName}>{name}</span>
                  {note && <span className={s.chipNote}>{T.unusual}</span>}
                  {chipNote?.(v) && <span className={s.chipNote} style={{ color: "var(--text-muted)" }}>{chipNote(v)}</span>}
                  <button type="button" className={s.icon} disabled={disabled || i === 0} aria-label={T.moveEarlier(name)} onClick={() => changeAt(move(values, i, -1), T.moved(name, i, values.length))}><span aria-hidden="true">←</span></button>
                  <button type="button" className={s.icon} disabled={disabled || i === values.length - 1} aria-label={T.moveLater(name)} onClick={() => changeAt(move(values, i, 1), T.moved(name, i + 2, values.length))}><span aria-hidden="true">→</span></button>
                  <button type="button" className={s.icon} disabled={disabled} aria-label={T.remove(name)} onClick={() => { changeAt(remove(values, i), T.removed(name)); focusInput(); }}><span aria-hidden="true">×</span></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {values.length > 1 && <p className={s.hint}>{T.dragHint}</p>}
      {notes.map((n) => <p key={n.index} className={n.ok ? s.warn : s.error}>{n.warn}</p>)}

      <div className={s.meta}>
        <span className={s.hint}>{T.count(values.length, MAX_VALUES)}</span>
        {values.length > 1 && scale && !isSorted(values) && <button type="button" className={s.button} disabled={disabled} onClick={() => changeAt(sorted(values), T.sorted)}>{T.sortByScale}</button>}
      </div>

      {showPreview && <p className={s.preview} data-testid="scale-preview"><span className={s.previewLabel}>{T.preview}: </span>{labels(values).join(" · ")}</p>}
      <p className={s.sr} role="status" aria-live="polite">{notice}</p>
    </div>
  );
}
