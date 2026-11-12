// Edit one size chart: details, an accessible grid, the product types it serves, and a live preview of what the buyer sees.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import Button from "../../../components/Button.jsx";
import ChartPreview from "./ChartPreview.jsx";
import * as M from "./model.js";
import { typesText } from "../../../lib/sizeCharts.js";

const keyOf = (r, c) => `${r}:${c}`;

export default function ChartEditor({ initial, original, types, categories, canEdit, saving, error, onSave, onCancel }) {
  const [chart, setChart] = useState(initial);
  const [announce, setAnnounce] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [convert, setConvert] = useState(true);
  const [typeQuery, setTypeQuery] = useState("");
  const [tab, setTab] = useState("edit"); // narrow screens: edit | preview
  const [frame, setFrame] = useState("phone");
  const cells = useRef({});
  const heads = useRef({});
  const [focusAt, setFocusAt] = useState(null);
  const uid = useId();

  const v = useMemo(() => M.validate(chart), [chart]);
  const dirty = M.isDirty(chart, original);
  const moved = M.movedTypes(chart, types);
  const released = M.releasedTypes(chart, original);

  // Leaving with unsaved changes asks first (the browser's own prompt for a tab close or reload).
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!focusAt) return;
    const node = focusAt.head ? heads.current[focusAt.c] : cells.current[keyOf(focusAt.r, focusAt.c)];
    node?.focus();
    setFocusAt(null);
  }, [focusAt, chart]);

  const set = (next, say) => { setChart(next); if (say) setAnnounce(say); };
  const edit = (patch) => set(M.setField(chart, patch));

  const onCellKey = (e, r, c) => {
    const go = (rr, cc) => { e.preventDefault(); if (rr >= 0 && rr < chart.rows.length && cc >= 0 && cc < chart.columns.length) setFocusAt({ r: rr, c: cc }); };
    if (e.key === "Enter") go(r + (e.shiftKey ? -1 : 1), c);
    else if (e.key === "ArrowDown") go(r + 1, c);
    else if (e.key === "ArrowUp") go(r - 1, c);
    else if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) go(r, c + 1);
    else if (e.key === "ArrowLeft" && e.currentTarget.selectionEnd === 0) go(r, c - 1);
  };

  const onPaste = (e, r, c) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!/[\t\n]/.test(text.trim())) return; // a single value pastes as normal
    e.preventDefault();
    const out = M.pasteBlock(chart, r, c, text);
    set(out.chart, `Pasted ${out.cells} ${out.cells === 1 ? "cell" : "cells"}${out.clipped ? ". Some did not fit and were left out" : ""}.`);
  };

  const addRow = (after) => { const o = M.addRow(chart, after); if (o.index < 0) return setAnnounce(`A chart can have ${M.LIMITS.rows} rows.`); set(o.chart, `Row ${o.index + 1} added.`); setFocusAt({ r: o.index, c: 0 }); };
  const removeRow = (r) => { if (chart.rows.length <= 1) return setAnnounce("A chart needs at least one row."); set(M.removeRow(chart, r), `Row ${r + 1} removed.`); setFocusAt({ r: Math.min(r, chart.rows.length - 2), c: 0 }); };
  const moveRow = (r, s) => { set(M.moveRow(chart, r, s), `Row moved to position ${r + s + 1} of ${chart.rows.length}.`); setFocusAt({ r: r + s, c: 0 }); };
  const addColumn = () => { const o = M.addColumn(chart); if (o.index < 0) return setAnnounce(`A chart can have ${M.LIMITS.columns} columns.`); set(o.chart, `Column ${o.index + 1} added.`); setFocusAt({ head: true, c: o.index }); };
  const removeColumn = (c) => { if (chart.columns.length <= 1) return setAnnounce("A chart needs at least one column."); set(M.removeColumn(chart, c), `Column ${c + 1} removed.`); setFocusAt({ head: true, c: Math.min(c, chart.columns.length - 2) }); };
  const moveColumn = (c, s) => { set(M.moveColumn(chart, c, s), `Column moved to position ${c + s + 1} of ${chart.columns.length}.`); setFocusAt({ head: true, c: c + s }); };

  const save = (e) => {
    e.preventDefault();
    if (!v.ok) { setShowErrors(true); setAnnounce(M.summary(v)); return; }
    onSave(M.toFields(chart));
  };

  const shownTypes = types.filter((t) => !typeQuery.trim() || `${t.name} ${t.id}`.toLowerCase().includes(typeQuery.trim().toLowerCase()));
  const nameId = `${uid}-name`;

  return (
    <form className="sc-editor" data-tab={tab} onSubmit={save} noValidate aria-label={chart.id ? `Edit ${original?.name ?? "chart"}` : "New size chart"}>
      <div className="sc-tabs" role="tablist" aria-label="Editor view">
        {[["edit", "Edit"], ["preview", "Preview"]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "sc-tab sc-tab--on" : "sc-tab"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="sc-editor__grid">
        <div className="sc-editor__main">
          <fieldset className="sc-card" disabled={!canEdit || saving}>
            <legend className="heading-sm">Details</legend>
            <label className="field">Name
              <input id={nameId} value={chart.name} maxLength={80} onChange={(e) => edit({ name: e.target.value })} aria-invalid={showErrors && Boolean(v.errors.name)} aria-describedby={showErrors && v.errors.name ? `${nameId}-err` : undefined} placeholder="Dresses and tops" />
              {showErrors && v.errors.name && <span id={`${nameId}-err`} className="sc-error">{v.errors.name}</span>}
            </label>
            <div className="sc-row">
              <label className="field">Category (optional)
                <select value={chart.category ?? ""} onChange={(e) => edit({ category: e.target.value })}>
                  <option value="">No category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="field">Unit
                <select value={chart.unit} onChange={(e) => set(M.setUnit(chart, e.target.value, { convert }), M.canConvert(chart) && convert && (chart.unit === "cm" || chart.unit === "in") ? `Numbers converted to ${e.target.value}.` : "")}>
                  {M.UNITS.map((u) => <option key={u} value={u}>{M.UNIT_LABELS[u]}</option>)}
                </select>
              </label>
            </div>
            {(chart.unit === "cm" || chart.unit === "in") && M.canConvert(chart) && (
              <label className="sc-check"><input type="checkbox" checked={convert} onChange={(e) => setConvert(e.target.checked)} /> Convert the numbers when I change between cm and in (rounded to one decimal)</label>
            )}
            <label className="sc-check"><input type="checkbox" checked={chart.active} onChange={(e) => edit({ active: e.target.checked })} /> Show this chart to buyers</label>
          </fieldset>

          <fieldset className="sc-card" disabled={!canEdit || saving}>
            <legend className="heading-sm">Sizes</legend>
            <p className="muted">Type or paste from a spreadsheet. Enter and the arrow keys move between cells. The first column names each size.</p>
            {showErrors && v.errors.columns && <p className="sc-error" role="alert">{v.errors.columns}</p>}
            <div className="sc-scroll sc-scroll--grid" data-no-cards role="region" aria-label="Chart grid, scrolls sideways" tabIndex={0}>
              <table className="sc-grid">
                <thead>
                  <tr>
                    <th scope="col" className="sc-grid__corner"><span className="sr-only">Row actions</span></th>
                    {chart.columns.map((col, c) => (
                      <th key={c} scope="col">
                        <input ref={(n) => { heads.current[c] = n; }} aria-label={`Column ${c + 1} name`} value={col} maxLength={M.LIMITS.column} onChange={(e) => set(M.renameColumn(chart, c, e.target.value))} aria-invalid={Boolean(v.columnErrors[c])} aria-describedby={v.columnErrors[c] ? `${uid}-h${c}` : undefined} />
                        <span className="sc-mini">
                          <button type="button" aria-label={`Move column ${c + 1} left`} disabled={c === 0} onClick={() => moveColumn(c, -1)}>←</button>
                          <button type="button" aria-label={`Move column ${c + 1} right`} disabled={c === chart.columns.length - 1} onClick={() => moveColumn(c, 1)}>→</button>
                          <button type="button" aria-label={`Remove column ${c + 1}`} disabled={chart.columns.length <= 1} onClick={() => removeColumn(c)}>✕</button>
                        </span>
                        {v.columnErrors[c] && <span id={`${uid}-h${c}`} className="sc-error">{v.columnErrors[c]}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chart.rows.map((row, r) => (
                    <tr key={r}>
                      <th scope="row" className="sc-grid__rowhead">
                        <span className="sc-mini">
                          <span className="sc-num" aria-hidden="true">{r + 1}</span>
                          <button type="button" aria-label={`Move row ${r + 1} up`} disabled={r === 0} onClick={() => moveRow(r, -1)}>↑</button>
                          <button type="button" aria-label={`Move row ${r + 1} down`} disabled={r === chart.rows.length - 1} onClick={() => moveRow(r, 1)}>↓</button>
                          <button type="button" aria-label={`Remove row ${r + 1}`} disabled={chart.rows.length <= 1} onClick={() => removeRow(r)}>✕</button>
                        </span>
                      </th>
                      {row.map((cell, c) => {
                        const bad = v.cells[keyOf(r, c)];
                        return (
                          <td key={c}>
                            <input
                              ref={(n) => { cells.current[keyOf(r, c)] = n; }}
                              aria-label={`${chart.columns[c] || `Column ${c + 1}`}, row ${r + 1}`}
                              value={cell}
                              maxLength={M.LIMITS.cell}
                              inputMode={c === 0 ? "text" : "decimal"}
                              onChange={(e) => set(M.editCell(chart, r, c, e.target.value))}
                              onKeyDown={(e) => onCellKey(e, r, c)}
                              onPaste={(e) => onPaste(e, r, c)}
                              aria-invalid={showErrors && Boolean(bad)}
                              aria-describedby={showErrors && bad ? `${uid}-c${keyOf(r, c)}` : undefined}
                            />
                            {showErrors && bad && <span id={`${uid}-c${keyOf(r, c)}`} className="sr-only">{bad}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sc-actions">
              <Button type="button" onClick={() => addRow()} disabled={chart.rows.length >= M.LIMITS.rows}>Add a row</Button>
              <Button type="button" onClick={addColumn} disabled={chart.columns.length >= M.LIMITS.columns}>Add a column</Button>
              <span className="muted">{chart.rows.length} of {M.LIMITS.rows} rows, {chart.columns.length} of {M.LIMITS.columns} columns</span>
            </div>
            {showErrors && v.count > 0 && <p className="sc-error" role="status">{M.summary(v)} Cells marked in red are empty or too long.</p>}
          </fieldset>

          <fieldset className="sc-card" disabled={!canEdit || saving}>
            <legend className="heading-sm">Product types</legend>
            <p className="muted">A type has one chart. Saving moves a type here from its old chart, and a type left unticked is released. Buyers see the chart of the item&rsquo;s type.</p>
            <label className="field">Find a type
              <input type="search" value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} placeholder="Dress, shoes, shirt" />
            </label>
            <ul className="sc-types">
              {shownTypes.map((t) => {
                const on = chart.productTypeIds.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className="sc-check"><input type="checkbox" checked={on} onChange={() => set(M.toggleType(chart, t.id))} /> <span>{t.name}{t.sizeChartId && t.sizeChartId !== chart.id ? <span className="muted"> · has another chart</span> : null}</span></label>
                  </li>
                );
              })}
              {shownTypes.length === 0 && <li className="muted">No type matches.</li>}
            </ul>
            <p role="status" className="muted">{typesText(chart.productTypeIds.length)} selected (up to {M.MAX_TYPES}).</p>
            {moved.length > 0 && <p className="sc-note" role="status">Saving moves {moved.map((m) => m.name).join(", ")} from {moved.length === 1 ? "its current chart" : "their current charts"} to this one.</p>}
            {released.length > 0 && <p className="sc-note" role="status">Saving releases {released.length} {released.length === 1 ? "type" : "types"} that used this chart.</p>}
            <p className="muted">Choosing a chart for one single item is done by the seller on that item&rsquo;s page, not here.</p>
          </fieldset>
        </div>

        <aside className="sc-editor__side" aria-label="Preview">
          <h3 className="heading-sm">What buyers see</h3>
          <div role="radiogroup" aria-label="Preview width" className="sc-seg">
            {[["phone", "Phone"], ["wide", "Wide"]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={frame === id} tabIndex={frame === id ? 0 : -1} className={frame === id ? "sc-seg__btn sc-seg__btn--on" : "sc-seg__btn"} onClick={() => setFrame(id)}>{label}</button>
            ))}
          </div>
          <ChartPreview chart={chart} frame={frame} />
        </aside>
      </div>

      {error ? <p className="modal__error" role="alert">{error}</p> : null}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="sc-footer">
        <Button type="button" onClick={onCancel} disabled={saving}>{dirty ? "Discard changes" : "Back to the list"}</Button>
        {canEdit && <Button type="submit" variant="primary" disabled={saving || !dirty}>{saving ? "Saving" : chart.id ? "Save chart" : "Create chart"}</Button>}
        {dirty && <span className="muted" aria-live="polite">Unsaved changes</span>}
      </div>
    </form>
  );
}
