import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCopy, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { OPTION_LIMITS, SPEC_GROUPS, addDependentValue, copyDependentValues, dependentSets, dependentSpecs, limitMessage, setDependentSpecs, toggleDependentValue } from "@epicmkt/shared";
import ed from "../../editor.module.css";
import s from "./options.module.css";

// The SanDisk pattern: one row of value chips per parent value. The chips are the combinations themselves (on = sold), so nothing is
// stored twice. Prices are typed in the combinations list below; "Compatible devices"-style rows are stored on that parent's combinations.
export default function DependentEditor({ options, axisKey, set, limits, announce }) {
  const axis = options.axes.find((a) => a.key === axisKey);
  const parent = options.axes.find((a) => a.key === axis.dependsOn);
  const sets = dependentSets(options, axisKey);
  return (
    <div className={s.stack}>
      <p className={s.depLead}>Tick the {axis.label.toLowerCase()} values each {parent.label.toLowerCase()} sells. Untick one to stop selling it there; the price you typed is kept if you tick it again.</p>
      <ul className={s.dep}>
        {sets.map((st) => (
          <Parent key={st.parentValue.id} st={st} sets={sets} options={options} axis={axis} set={set} limits={limits} announce={announce} />
        ))}
      </ul>
    </div>
  );
}

function Parent({ st, sets, options, axis, set, limits, announce }) {
  const uid = useId();
  const pv = st.parentValue;
  const others = sets.filter((o) => o.parentValue.id !== pv.id);
  const [from, setFrom] = useState(others[0]?.parentValue.id ?? "");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const specs = dependentSpecs(options, axis.key, pv.id);
  const sold = st.values.filter((v) => v.sold).length;

  const addNew = () => {
    const r = addDependentValue(options, axis.key, pv.id, draft, limits);
    if (r.error) { setNote(r.error === "duplicate" ? `${r.existing.label} is already in the list. Tick it above.` : r.error === "empty" ? "Type a value first." : limitMessage(r.error, limits, r.plan)); return; }
    set(r.options); setDraft(""); setNote(""); announce(`${draft.trim()} added for ${pv.label}.`);
  };
  const editSpec = (i, patch) => set(setDependentSpecs(options, axis.key, pv.id, specs.map((r, n) => (n === i ? { ...r, ...patch } : r))));

  return (
    <li>
      <fieldset className={s.depSet}>
        <legend>{pv.label} sells {sold} {sold === 1 ? "value" : "values"}</legend>
        <ul className={s.toggles}>
          {st.values.map(({ value, sold: on }) => (
            <li key={value.id}>
              <button type="button" className={s.toggle} aria-pressed={on}
                onClick={() => { set(toggleDependentValue(options, axis.key, pv.id, value.id)); announce(`${value.label} ${on ? "not sold" : "sold"} with ${pv.label}.`); }}>
                {on && <FontAwesomeIcon icon={faCheck} aria-hidden="true" />}{value.label}
              </button>
            </li>
          ))}
        </ul>

        <div className={s.copyRow}>
          <div className={s.addRow} style={{ flex: "1 1 14rem" }}>
            <div className={ed.field}>
              <label className={ed.label} htmlFor={`${uid}-new`}>Add a {axis.label.toLowerCase()} for {pv.label} only</label>
              <input id={`${uid}-new`} className={ed.input} value={draft} maxLength={OPTION_LIMITS.valueLabel} autoComplete="off" onChange={(e) => { setDraft(e.target.value); setNote(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }} />
            </div>
            <button type="button" className={s.pill} onClick={addNew}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />Add<span className={ed.sr}> for {pv.label}</span></button>
          </div>
          {others.length > 0 && (
            <div className={s.copyRow}>
              {others.length > 1 && (
                <div className={ed.field}>
                  <label className={ed.label} htmlFor={`${uid}-from`}>Copy from</label>
                  <select id={`${uid}-from`} className={ed.input} value={from} onChange={(e) => setFrom(e.target.value)}>
                    {others.map((o) => <option key={o.parentValue.id} value={o.parentValue.id}>{o.parentValue.label}</option>)}
                  </select>
                </div>
              )}
              <button type="button" className={s.pill}
                onClick={() => { const src = others.find((o) => o.parentValue.id === from) ?? others[0]; set(copyDependentValues(options, axis.key, src.parentValue.id, pv.id)); announce(`${pv.label} now sells the same ${axis.label.toLowerCase()} values as ${src.parentValue.label}.`); }}>
                <FontAwesomeIcon icon={faCopy} aria-hidden="true" />Copy values from {others.length > 1 ? "the one chosen" : others[0].parentValue.label}
              </button>
            </div>
          )}
        </div>
        {note && <p className={ed.error}>{note}</p>}

        <div className={s.stack} role="group" aria-label={`Details that differ for ${pv.label}`}>
          <span className={ed.label}>Details that differ for {pv.label} (optional)</span>
          <p className={s.depNote}>For example Compatible devices. Buyers see this row change when they pick {pv.label}.</p>
          {specs.length > 0 && (
            <ul className={s.specRows}>
              {specs.map((r, i) => (
                <li key={i} className={s.specRow}>
                  <div className={ed.field}><label className={ed.label} htmlFor={`${uid}-sl-${i}`}>Detail name</label><input id={`${uid}-sl-${i}`} className={ed.input} value={r.label} maxLength={60} onChange={(e) => editSpec(i, { label: e.target.value })} /></div>
                  <div className={ed.field}><label className={ed.label} htmlFor={`${uid}-sv-${i}`}>Value for {pv.label}</label><input id={`${uid}-sv-${i}`} className={ed.input} value={r.value} maxLength={200} onChange={(e) => editSpec(i, { value: e.target.value })} /></div>
                  <button type="button" className={s.chipBtn} style={{ inlineSize: "var(--tap)", blockSize: "var(--tap)" }} aria-label={`Remove detail ${r.label || i + 1} for ${pv.label}`}
                    onClick={() => set(setDependentSpecs(options, axis.key, pv.id, specs.filter((_, n) => n !== i)))}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className={s.pill} disabled={specs.length >= OPTION_LIMITS.specs}
            onClick={() => set(setDependentSpecs(options, axis.key, pv.id, [...specs, { group: SPEC_GROUPS[0], label: "", value: "" }]))}>
            <FontAwesomeIcon icon={faPlus} aria-hidden="true" />Add a detail for {pv.label}
          </button>
        </div>
      </fieldset>
    </li>
  );
}
