// The shoe conversion table: one editable table (Adult, Kids), a live preview of what buyers see, and a "try a size" converter.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "../../../components/Button.jsx";
import * as S from "./shoeModel.js";

export default function ShoeTab({ stored, canEdit, saving, error, onSave }) {
  const original = useMemo(() => S.fromChart(stored?.chart), [stored]);
  const [state, setState] = useState(original);
  const [group, setGroup] = useState("adult");
  const [audience, setAudience] = useState("men");
  const [tryText, setTryText] = useState("EU 42");
  const [announce, setAnnounce] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const refs = useRef({});
  const [focusAt, setFocusAt] = useState(null);
  const uid = useId();

  useEffect(() => { setState(original); setShowErrors(false); }, [original]);
  useEffect(() => { if (focusAt) { refs.current[focusAt]?.focus(); setFocusAt(null); } }, [focusAt, state]);

  const v = useMemo(() => S.validate(state), [state]);
  const dirty = S.isDirty(state, original);
  const view = useMemo(() => S.preview(state, audience), [state, audience]);
  const tried = useMemo(() => S.tryConvert(state, tryText), [state, tryText]);
  const fields = group === "adult" ? S.FIELDS : S.KIDS_FIELDS;

  const edit = (r, f, value) => setState(S.editCell(state, group, r, f, value));
  const add = (after) => { const o = S.addRow(state, group, after); if (o.index < 0) return setAnnounce(`A table can have ${S.MAX_ROWS} rows.`); setState(o.state); setAnnounce(`Row ${o.index + 1} added.`); setFocusAt(`${group}:${o.index}:eu`); };
  const remove = (r) => { const next = S.removeRow(state, group, r); if (next === state) return setAnnounce(group === "adult" ? "Adult sizes need at least 2 rows." : "Nothing to remove."); setState(next); setAnnounce(`Row ${r + 1} removed.`); setFocusAt(`${group}:${Math.min(r, next[group].length - 1)}:eu`); };
  const key = (e, r, f) => {
    const i = fields.indexOf(f);
    const go = (rr, ff) => { e.preventDefault(); if (state[group][rr]) setFocusAt(`${group}:${rr}:${ff}`); };
    if (e.key === "Enter" || e.key === "ArrowDown") go(r + (e.shiftKey ? -1 : 1), f);
    else if (e.key === "ArrowUp") go(r - 1, f);
    else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length && fields[i + 1]) go(r, fields[i + 1]);
    else if (e.key === "ArrowLeft" && e.currentTarget.selectionEnd === 0 && fields[i - 1]) go(r, fields[i - 1]);
  };
  const submit = (e) => {
    e.preventDefault();
    if (!v.ok) { setShowErrors(true); setAnnounce(S.summary(v)); return; }
    onSave(v.value);
  };

  return (
    <form className="sc-editor" onSubmit={submit} noValidate aria-label="Shoe conversion table">
      <div className="sc-editor__grid">
        <div className="sc-editor__main">
          <fieldset className="sc-card" disabled={!canEdit || saving}>
            <legend className="heading-sm">Shoe conversion table{stored?.version ? ` (version ${stored.version})` : ""}</legend>
            <p className="muted">Every shoe size shown to buyers, and every conversion between EU, UK, US and foot length, comes from this table. Sizes must rise from one row to the next.</p>
            <div role="radiogroup" aria-label="Table" className="sc-seg">
              {S.GROUPS.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={group === g.id} tabIndex={group === g.id ? 0 : -1} className={group === g.id ? "sc-seg__btn sc-seg__btn--on" : "sc-seg__btn"} onClick={() => { setGroup(g.id); setAudience(g.id === "kids" ? "kids" : audience === "kids" ? "men" : audience); }}>{g.label}</button>
              ))}
            </div>
            {showErrors && v.general.map((m) => <p key={m} className="sc-error" role="alert">{m}</p>)}
            <div className="sc-scroll sc-scroll--grid" data-no-cards role="region" aria-label={`${group === "adult" ? "Adult" : "Kids"} shoe sizes, scrolls sideways`} tabIndex={0}>
              <table className="sc-grid">
                <thead>
                  <tr>
                    <th scope="col" className="sc-grid__corner"><span className="sr-only">Row actions</span></th>
                    {fields.map((f) => <th key={f} scope="col">{S.FIELD_LABELS[f]}</th>)}
                    <th scope="col"><span className="sr-only">Problems</span></th>
                  </tr>
                </thead>
                <tbody>
                  {state[group].map((row, r) => {
                    const problems = v.rows[`${group}:${r}`] ?? [];
                    return (
                      <tr key={r} className={showErrors && problems.length ? "sc-shoe-row--bad" : undefined}>
                        <th scope="row" className="sc-grid__rowhead">
                          <span className="sc-mini">
                            <span className="sc-num" aria-hidden="true">{r + 1}</span>
                            <button type="button" aria-label={`Add a row after row ${r + 1}`} onClick={() => add(r)} disabled={state[group].length >= S.MAX_ROWS}>+</button>
                            <button type="button" aria-label={`Remove row ${r + 1}`} onClick={() => remove(r)} disabled={group === "adult" && state.adult.length <= 2}>✕</button>
                          </span>
                        </th>
                        {fields.map((f) => (
                          <td key={f}>
                            <input
                              ref={(n) => { refs.current[`${group}:${r}:${f}`] = n; }}
                              aria-label={`${S.FIELD_LABELS[f]}, row ${r + 1}`}
                              inputMode="decimal"
                              value={row[f]}
                              onChange={(e) => edit(r, f, e.target.value)}
                              onKeyDown={(e) => key(e, r, f)}
                              aria-invalid={showErrors && problems.length > 0}
                              aria-describedby={showErrors && problems.length ? `${uid}-${group}-${r}` : undefined}
                            />
                          </td>
                        ))}
                        <td>{showErrors && problems.length > 0 && <span id={`${uid}-${group}-${r}`} className="sc-error">{problems.join(" ")}</span>}</td>
                      </tr>
                    );
                  })}
                  {state[group].length === 0 && <tr><td colSpan={fields.length + 2} className="muted">No kids rows. Add one if you sell kids shoes.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="sc-actions">
              <Button type="button" onClick={() => add()} disabled={state[group].length >= S.MAX_ROWS}>Add a row</Button>
              <Button type="button" onClick={() => setConfirmReset(true)}>Reset to the default table</Button>
              <span className="muted">{state[group].length} of {S.MAX_ROWS} rows</span>
            </div>
            {confirmReset && (
              <div className="sc-note" role="alertdialog" aria-label="Reset the table">
                <p>This replaces every row you see with the built-in table. Nothing is saved until you press Save.</p>
                <div className="sc-actions">
                  <Button type="button" variant="primary" onClick={() => { setState(S.defaultState()); setConfirmReset(false); setAnnounce("Table reset to the default. Save to keep it."); }}>Replace the rows</Button>
                  <Button type="button" onClick={() => setConfirmReset(false)}>Keep my rows</Button>
                </div>
              </div>
            )}
            {showErrors && !v.ok && <p className="sc-error" role="status">{S.summary(v)}</p>}
          </fieldset>
        </div>

        <aside className="sc-editor__side" aria-label="Preview">
          <h3 className="heading-sm">What buyers see</h3>
          <div role="radiogroup" aria-label="Preview audience" className="sc-seg">
            {[["men", "Men"], ["women", "Women"], ["kids", "Kids"]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={audience === id} tabIndex={audience === id ? 0 : -1} className={audience === id ? "sc-seg__btn sc-seg__btn--on" : "sc-seg__btn"} onClick={() => setAudience(id)}>{label}</button>
            ))}
          </div>
          {!view.valid && <p className="sc-note" role="status">The table has problems, so this shows the last saved version.</p>}
          <div className="sc-preview sc-preview--phone" data-testid="shoe-preview">
            <div className="sc-scroll" data-no-cards role="region" aria-label="Shoe table preview" tabIndex={0}>
              <table className="sc-table">
                <thead><tr><th scope="col">EU</th>{audience !== "kids" && <th scope="col">UK</th>}{audience !== "kids" && <th scope="col">US</th>}<th scope="col">cm</th></tr></thead>
                <tbody>
                  {view.rows.map((r) => (
                    <tr key={r.eu}><th scope="row">{r.eu}</th>{audience !== "kids" && <td>{r.uk}</td>}{audience !== "kids" && <td>{r.us}</td>}<td>{r.cm}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="sc-card sc-try">
            <label className="field">Try a size
              <input value={tryText} onChange={(e) => setTryText(e.target.value)} placeholder="EU 42, UK 8, US 9" aria-describedby={`${uid}-try`} />
            </label>
            <div id={`${uid}-try`} aria-live="polite">
              {tried.ok ? (
                <ul className="sc-try__out">{tried.lines.map((l) => <li key={l.system} className="sc-chip">{l.text}</li>)}</ul>
              ) : <p className="muted">{tried.message}</p>}
            </div>
          </div>
        </aside>
      </div>

      {error ? <p className="modal__error" role="alert">{error}</p> : null}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="sc-footer">
        {canEdit && <Button type="submit" variant="primary" disabled={saving || !dirty}>{saving ? "Saving" : "Save table"}</Button>}
        {dirty && <Button type="button" onClick={() => { setState(original); setShowErrors(false); }} disabled={saving}>Discard changes</Button>}
        {dirty && <span className="muted" aria-live="polite">Unsaved changes</span>}
      </div>
    </form>
  );
}
