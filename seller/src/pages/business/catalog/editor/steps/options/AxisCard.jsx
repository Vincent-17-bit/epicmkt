import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { scales, DISPLAYS, OPTION_LIMITS, addValue, canAddValue, dependencyChoices, limitMessage, moveValue, removeValue, setDependsOn, setDisplay, setValueColor, renameAxis } from "@epicmkt/shared";
import DependentEditor from "./DependentEditor.jsx";
import ed from "../../editor.module.css";
import s from "./options.module.css";

const ERRORS = { empty: "Type a value first.", long: `Use ${OPTION_LIMITS.valueLabel} characters or fewer.` };

// One option type (Colour, Storage...): its name, how the buyer picks it, its values as chips, and the dependent-list switch.
export default function AxisCard({ options, index, set, limits, announce, onRemove, errors = {} }) {
  const axis = options.axes[index];
  const uid = useId();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const parents = dependencyChoices(options, axis.key);
  const can = canAddValue(options, axis.key, limits);
  const nameErr = errors[`axes.${index}.label`];
  const valuesErr = errors[`axes.${index}.values`];
  const label = axis.label || `Option ${index + 1}`;
  const full = axis.values.length / limits.values;

  const add = () => {
    // Several values at once: "S, M, L" or one per line.
    const parts = draft.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) { setNote(ERRORS.empty); return; }
    let next = options;
    const added = [];
    let problem = "";
    for (const raw of parts) {
      // An axis tied to a scale (Storage, clothing size) reads what was typed the one shared way: "128gb" -> "128 GB", "1024 GB" -> "1 TB".
      let p = raw;
      let extras = {};
      if (axis.scale) {
        const read = scales.parse(axis.scale, raw, {});
        if (!read.ok) { problem = read.error.message; continue; }
        p = scales.format(read.value);
        extras = { scaleValue: read.value };   // kept with the value, so buyers read "1 TB" from data and sizes can be filtered
      }
      const r = addValue(next, axis.key, p, extras, limits);
      if (r.error === "duplicate") { problem = `${r.existing.label} is already listed.`; continue; }
      if (r.error) { problem = ERRORS[r.error] ?? limitMessage(r.error, limits, r.plan); break; }
      next = r.options;
      added.push(p);
    }
    if (added.length) { set(next); announce(`${added.join(", ")} added to ${label}.`); }
    setNote(problem);
    setDraft(problem && !added.length ? draft : "");
  };

  const dependsOn = axis.dependsOn ?? "";
  const parent = options.axes.find((a) => a.key === axis.dependsOn);

  return (
    <li className={s.axis}>
      <div className={s.axisTop}>
        <p className={s.axisIndex}><span className={s.axisNum} aria-hidden="true">{index + 1}</span>Option type {index + 1}</p>
        <button
          type="button" className={s.removeBtn} data-confirm={confirm ? "" : undefined}
          onClick={() => { if (confirm) { onRemove(axis.key); announce(`${label} removed.`); } else setConfirm(true); }}
          onBlur={() => setConfirm(false)}
        >{confirm ? `Yes, remove ${label}` : "Remove"}<span className={ed.sr}>{confirm ? "" : ` ${label}`}</span></button>
      </div>

      <div className={s.axisFields}>
        <div className={ed.field}>
          <label className={ed.label} htmlFor={`${uid}-name`}>Name</label>
          <input id={`${uid}-name`} className={ed.input} data-focus={`opt-axes.${index}.label`} value={axis.label} maxLength={OPTION_LIMITS.axisLabel} autoComplete="off"
            aria-invalid={nameErr ? "true" : undefined} aria-describedby={nameErr ? `${uid}-name-err` : undefined}
            onChange={(e) => set(renameAxis(options, axis.key, e.target.value))} placeholder="For example Colour" />
          {nameErr && <p id={`${uid}-name-err`} className={ed.error}>{nameErr}</p>}
        </div>
        <div className={ed.field}>
          <label className={ed.label} htmlFor={`${uid}-display`}>Buyers pick it as</label>
          <select id={`${uid}-display`} className={ed.input} value={axis.display} onChange={(e) => set(setDisplay(options, axis.key, e.target.value))}>
            {DISPLAYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
      </div>

      <div className={s.stack} role="group" aria-labelledby={`${uid}-vals`}>
        <span id={`${uid}-vals`} className={ed.label}>Values for {label}</span>
        {axis.values.length > 0 && (
          <ul className={s.values}>
            {axis.values.map((v, i) => (
              <li key={v.id} className={s.chip}>
                {axis.display === "swatch" && (
                  <input type="color" className={s.swatchInput} value={v.color ?? "#9ca3af"} aria-label={`Colour for ${v.label}`} onChange={(e) => set(setValueColor(options, axis.key, v.id, e.target.value))} />
                )}
                <span className={s.chipLabel}>{v.label}</span>
                <button type="button" className={s.chipBtn} aria-label={`Move ${v.label} earlier`} disabled={i === 0} onClick={() => { set(moveValue(options, axis.key, v.id, -1)); announce(`${v.label} moved earlier.`); }}><FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" /></button>
                <button type="button" className={s.chipBtn} aria-label={`Move ${v.label} later`} disabled={i === axis.values.length - 1} onClick={() => { set(moveValue(options, axis.key, v.id, 1)); announce(`${v.label} moved later.`); }}><FontAwesomeIcon icon={faChevronRight} aria-hidden="true" /></button>
                <button type="button" className={s.chipBtn} aria-label={`Remove ${v.label}`} onClick={() => { set(removeValue(options, axis.key, v.id)); announce(`${v.label} removed.`); document.getElementById(`${uid}-add`)?.focus(); }}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        <div className={s.addRow}>
          <div className={ed.field}>
            <label className={ed.label} htmlFor={`${uid}-add`}>Add a value</label>
            <input id={`${uid}-add`} className={ed.input} data-focus={`opt-axes.${index}.values`} value={draft} autoComplete="off" enterKeyHint="done" disabled={!can.ok && can.reason !== "none"}
              aria-invalid={note || valuesErr ? "true" : undefined} aria-describedby={`${uid}-add-note`}
              placeholder={axis.display === "swatch" ? "Black, Grey, Blue" : "Type one, or several with commas"}
              onChange={(e) => { setDraft(e.target.value); setNote(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          </div>
          <button type="button" className={`${s.pill} ${s.pillPrimary}`} onClick={add} disabled={!can.ok && can.reason !== "none"}>
            <FontAwesomeIcon icon={faPlus} aria-hidden="true" />Add<span className={ed.sr}> value to {label}</span>
          </button>
        </div>
        <div id={`${uid}-add-note`}>
          {(note || valuesErr) && <p className={ed.error}>{note || valuesErr}</p>}
          {!can.ok && can.reason !== "none" && <p className={s.limit} role="status">{limitMessage(can.reason, limits, can.plan)}</p>}
        </div>
        <p className={s.counterRow}>
          <span>{axis.values.length} of {limits.values} values</span>
          <span className={s.meter} aria-hidden="true"><span className={s.meterFill} data-full={full >= 1 ? "" : undefined} style={{ inlineSize: `${Math.min(100, full * 100)}%` }} /></span>
        </p>
      </div>

      {parents.length > 0 && axis.values.length > 0 && (
        <div className={s.depSwitch} data-on={axis.dependsOn ? "" : undefined}>
          <label className={s.switchRow}>
            <span className={s.switchText}>
              <span>This list changes with {parent?.label || parents[parents.length - 1].label}</span>
              <span className={s.switchHint}>Turn on when some {label.toLowerCase()} values are sold with one {(parent ?? parents[parents.length - 1]).label.toLowerCase()} and not another.</span>
            </span>
            <input type="checkbox" role="switch" className={s.switchInput} checked={Boolean(axis.dependsOn)} data-focus={`opt-dep-${index}`}
              onChange={(e) => { set(setDependsOn(options, axis.key, e.target.checked ? parents[parents.length - 1].key : null)); announce(e.target.checked ? `${label} now changes with ${parents[parents.length - 1].label}.` : `${label} is the same for every ${(parent?.label ?? "").toLowerCase()}. Your combinations were kept.`); }} />
            <span className={s.track} aria-hidden="true" />
          </label>
          {axis.dependsOn && parents.length > 1 && (
            <div className={ed.field}>
              <label className={ed.label} htmlFor={`${uid}-parent`}>It changes with</label>
              <select id={`${uid}-parent`} className={ed.input} value={dependsOn} onChange={(e) => set(setDependsOn(options, axis.key, e.target.value))}>
                {parents.map((p) => <option key={p.key} value={p.key}>{p.label || p.key}</option>)}
              </select>
            </div>
          )}
        </div>
      )}
      {axis.dependsOn && parent && <DependentEditor options={options} axisKey={axis.key} set={set} limits={limits} announce={announce} />}
    </li>
  );
}
