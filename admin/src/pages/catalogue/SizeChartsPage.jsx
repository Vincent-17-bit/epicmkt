// A05: size charts and the shoe conversion chart. Owners edit; every admin can look.
// The right-hand preview is the table a buyer sees, drawn from the draft as you type.
import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import Tabs from "../../components/Tabs.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import {
  SHOE_COLUMNS, SHOE_GROUPS, SIZE_CHART_LIMITS, SIZE_CHART_UNITS, UNIT_LABELS, addColumn, addRow, addShoeRow, blankChart, cleanDraft, cleanShoeDraft,
  isDirty, parseTypeIds, removeColumn, removeRow, removeShoeRow, setCell, setColumn, setShoeCell, shoePreview, shoeFromDraft, shoeToDraft, sizeError, toDraft,
} from "../../lib/sizeCharts.js";

const KEY = "admin-size-charts";
const TABS = [{ id: "charts", label: "Size charts" }, { id: "shoes", label: "Shoe conversion" }];

function ChartTable({ columns, rows, caption }) {
  return (
    <div className="sizes__scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="sizes__table">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((c, i) => <th key={i} scope="col">{c || "—"}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={Math.max(columns.length, 1)} className="muted">No rows yet.</td></tr> : rows.map((row, r) => (
            <tr key={r}>{row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell || "—"}</th> : <td key={i}>{cell || "—"}</td>))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- Size charts */

// The editor starts from `saved` and is remounted (by its key) when the chosen chart or its saved data changes, so there is no effect that could
// overwrite what is being typed.
function ChartEditor({ saved, canEdit, onSaved, onDeleted, onCancelNew }) {
  const toast = useToast();
  const [draft, setDraft] = useState(saved);
  const [typesText, setTypesText] = useState(saved.productTypeIds.join(", "));
  const [touched, setTouched] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameId = useId();
  const typesId = useId();

  const typed = parseTypeIds(typesText);
  const working = { ...draft, productTypeIds: typed.ids };
  const result = cleanDraft(working);
  const errors = { ...result.errors, ...(typed.bad.length ? { productTypeIds: `Not a product type id: ${typed.bad.join(", ")}.` } : {}) };
  const dirty = isDirty(working, saved);
  const update = (next) => setDraft(next);
  const lock = !canEdit;

  const save = useMutation({
    mutationFn: () => api.saveSizeChart(saved.id, result.fields),
    onSuccess: (id) => { toast.push({ message: `Saved “${result.fields.name}”.` }); onSaved(id); },
    onError: (e) => toast.push({ message: sizeError(e), tone: "error" }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSizeChart(saved.id),
    onSuccess: () => { toast.push({ message: `Deleted “${saved.name}”.` }); setConfirmDelete(false); onDeleted(); },
    onError: (e) => toast.push({ message: sizeError(e), tone: "error" }),
  });

  const moved = typed.ids.length > 0;
  const submit = (event) => { event.preventDefault(); setTouched(true); if (result.ok && typed.bad.length === 0) save.mutate(); };

  return (
    <div className="sizes__editor">
      <form className="sizes__form" onSubmit={submit} noValidate aria-label={saved.id ? `Edit ${saved.name}` : "New size chart"}>
        <div className="builder__row">
          <label className="field" htmlFor={nameId}>Name
            <input id={nameId} value={draft.name} maxLength={SIZE_CHART_LIMITS.name} disabled={lock} onChange={(e) => update({ ...draft, name: e.target.value })} aria-invalid={touched && Boolean(errors.name)} />
            {touched && errors.name ? <span className="field__error" role="alert">{errors.name}</span> : null}
          </label>
          <label className="field">Unit
            <select value={draft.unit} disabled={lock} onChange={(e) => update({ ...draft, unit: e.target.value })}>
              {SIZE_CHART_UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u]}</option>)}
            </select>
          </label>
          <label className="field">Shop category (optional)
            <input value={draft.category} disabled={lock} onChange={(e) => update({ ...draft, category: e.target.value })} placeholder="e.g. tailor-boutique" />
          </label>
        </div>

        <fieldset className="sizes__grid" disabled={lock}>
          <legend className="heading-sm">Measurements</legend>
          <p className="muted">The first column names each size. Column headers can name a unit, like “Foot length (cm)”, so the buyer’s cm/in switch converts them.</p>
          {touched && errors.columns ? <p className="field__error" role="alert">{errors.columns}</p> : null}
          {touched && errors.rows ? <p className="field__error" role="alert">{errors.rows}</p> : null}
          <div className="sizes__scroll" role="region" aria-label="Chart editor" tabIndex={0}>
            <table className="sizes__table sizes__table--edit">
              <thead>
                <tr>
                  {draft.columns.map((col, c) => (
                    <th key={c} scope="col">
                      <input aria-label={`Column ${c + 1} name`} value={col} maxLength={SIZE_CHART_LIMITS.column} onChange={(e) => update(setColumn(draft, c, e.target.value))} />
                      {draft.columns.length > 1 && !lock ? <button type="button" className="sizes__x" aria-label={`Remove column ${col || c + 1}`} onClick={() => update(removeColumn(draft, c))}>×</button> : null}
                    </th>
                  ))}
                  <th aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c}><input aria-label={`${draft.columns[c] || `Column ${c + 1}`}, row ${r + 1}`} value={cell} maxLength={SIZE_CHART_LIMITS.cell} inputMode={c === 0 ? "text" : "decimal"} onChange={(e) => update(setCell(draft, r, c, e.target.value))} /></td>
                    ))}
                    <td>{!lock ? <button type="button" className="sizes__x" aria-label={`Remove row ${r + 1}`} onClick={() => update(removeRow(draft, r))}>×</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!lock ? (
            <div className="sizes__actions">
              <Button size="sm" onClick={() => update(addRow(draft))} disabled={draft.rows.length >= SIZE_CHART_LIMITS.rows}>Add row</Button>
              <Button size="sm" onClick={() => update(addColumn(draft))} disabled={draft.columns.length >= SIZE_CHART_LIMITS.columns}>Add column</Button>
            </div>
          ) : null}
        </fieldset>

        <label className="field" htmlFor={typesId}>Default for these product types
          <input id={typesId} value={typesText} disabled={lock} onChange={(e) => setTypesText(e.target.value)} placeholder="dress, shirt" aria-invalid={Boolean(errors.productTypeIds)} />
          <span className="muted">Separate ids with commas. A product type has one chart, so listing a type here moves it from its old chart; a type left out is released.</span>
          {errors.productTypeIds ? <span className="field__error" role="alert">{errors.productTypeIds}</span> : null}
        </label>
        <label className="sizes__check"><input type="checkbox" checked={draft.active} disabled={lock} onChange={(e) => update({ ...draft, active: e.target.checked })} /> Active (buyers can see it)</label>

        {saved.id && saved.itemsUsing > 0 ? <p className="muted">{saved.itemsUsing} item{saved.itemsUsing === 1 ? "" : "s"} use{saved.itemsUsing === 1 ? "s" : ""} this chart. Changing the rows updates what they show.</p> : null}

        {canEdit ? (
          <div className="sizes__footer">
            <Button type="submit" variant="primary" disabled={save.isPending || (!dirty && Boolean(saved.id))}>{save.isPending ? "Saving" : saved.id ? "Save changes" : "Create chart"}</Button>
            {saved.id ? <Button onClick={() => setConfirmDelete(true)} disabled={save.isPending}>Delete</Button> : <Button onClick={onCancelNew}>Cancel</Button>}
            {moved && dirty ? <span className="muted">Saving moves {typed.ids.join(", ")} to this chart.</span> : null}
          </div>
        ) : <p className="muted">Only Owners can change size charts. You can look at them here.</p>}
      </form>

      <aside className="sizes__preview" aria-label="What the buyer sees">
        <h3 className="heading-sm">What the buyer sees</h3>
        <p className="muted">{draft.name || "Untitled chart"}{draft.unit === "cm" || draft.unit === "in" ? " · buyers can switch between cm and in" : ""}</p>
        <ChartTable columns={draft.columns} rows={draft.rows} caption={draft.name || "Untitled chart"} />
      </aside>

      {confirmDelete ? (
        <Modal title={`Delete ${saved.name}?`} onClose={remove.isPending ? () => {} : () => setConfirmDelete(false)}>
          <div className="modal__form">
            <p>This removes the chart for good. If an item or a product type still uses it, the database refuses and nothing changes.</p>
            <div className="modal__footer">
              <Button onClick={() => setConfirmDelete(false)} disabled={remove.isPending}>Keep it</Button>
              <Button variant="primary" onClick={() => remove.mutate()} disabled={remove.isPending}>{remove.isPending ? "Deleting" : "Delete chart"}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function ChartsTab({ canEdit }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: [KEY, "charts"], queryFn: () => api.listSizeCharts() });
  const [selected, setSelected] = useState(null); // an id, or "new"
  const charts = useMemo(() => data ?? [], [data]);
  useEffect(() => { if (selected === null && charts.length) setSelected(charts[0].id); }, [charts, selected]);

  // One draft object per chosen chart: the editor resets only when the choice or the saved data changes, never on a keystroke.
  const saved = useMemo(() => {
    const row = selected === "new" ? blankChart() : charts.find((c) => c.id === selected);
    return row ? toDraft(row) : null;
  }, [selected, charts]);

  if (isError) return <LoadError error={error} onRetry={refetch} />;
  if (isLoading) return <p className="muted" role="status">Loading charts…</p>;

  const afterSave = async (id) => { await queryClient.invalidateQueries({ queryKey: [KEY] }); setSelected(id); };

  return (
    <div className="sizes">
      <nav className="sizes__list" aria-label="Size charts">
        {canEdit ? <Button variant="primary" onClick={() => setSelected("new")}>New chart</Button> : null}
        <ul>
          {charts.map((c) => (
            <li key={c.id}>
              <button type="button" className="sizes__item" aria-current={selected === c.id ? "true" : undefined} onClick={() => setSelected(c.id)}>
                <strong>{c.name}</strong>
                <span className="muted">{c.rows.length} rows · {c.unit}{c.product_type_ids.length ? ` · ${c.product_type_ids.join(", ")}` : ""}{c.active ? "" : " · hidden"}</span>
              </button>
            </li>
          ))}
        </ul>
        {charts.length === 0 ? <p className="muted">No charts yet.</p> : null}
      </nav>
      {saved ? (
        <ChartEditor key={`${selected}:${JSON.stringify(saved)}`} saved={saved} canEdit={canEdit} onSaved={afterSave} onDeleted={() => { setSelected(null); queryClient.invalidateQueries({ queryKey: [KEY] }); }} onCancelNew={() => setSelected(charts[0]?.id ?? null)} />
      ) : <p className="muted">Choose a chart to edit.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- Shoe conversion */

function ShoeTab({ canEdit }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: [KEY, "shoes"], queryFn: () => api.getShoeConversion() });
  const [draft, setDraft] = useState(null);
  const [group, setGroup] = useState("adult");
  const [audience, setAudience] = useState("men");
  useEffect(() => { if (data?.chart) setDraft(shoeToDraft(data.chart)); }, [data]);

  const save = useMutation({
    mutationFn: () => api.saveShoeConversion(shoeFromDraft(draft)),
    onSuccess: (version) => { toast.push({ message: `Saved shoe conversion (version ${version}). Sizes already on items do not change.` }); queryClient.invalidateQueries({ queryKey: [KEY, "shoes"] }); },
    onError: (e) => toast.push({ message: sizeError(e), tone: "error" }),
  });
  const clean = useMemo(() => (draft ? cleanShoeDraft(draft) : { ok: true, errors: [] }), [draft]);
  const preview = useMemo(() => (draft ? shoePreview(draft) : null), [draft]);

  if (isError) return <LoadError error={error} onRetry={refetch} />;
  if (isLoading || !draft) return <p className="muted" role="status">Loading the conversion chart…</p>;

  const dirty = JSON.stringify(draft) !== JSON.stringify(shoeToDraft(data.chart));
  const previewColumns = audience === "kids" ? ["EU", "Foot length (cm)"] : ["EU", "UK", audience === "women" ? "US women" : "US men", "Foot length (cm)"];
  const previewRows = (preview?.[audience] ?? []).map((r) => (audience === "kids" ? [String(r.eu), String(r.cm)] : [String(r.eu), String(r.uk), String(r.us), String(r.cm)]));

  return (
    <div className="sizes sizes--shoes">
      <div className="sizes__editor">
        <form className="sizes__form" onSubmit={(e) => { e.preventDefault(); if (clean.ok) save.mutate(); }} aria-label="Shoe conversion chart" noValidate>
          <p className="muted">One row per whole EU size. Every column must rise from row to row. Adult rows need every size; kids rows need EU and foot length, and kids must end below where adult starts. Version {data.version}.</p>
          <Tabs tabs={SHOE_GROUPS} value={group} onChange={setGroup} label="Shoe size group" idPrefix="shoe-group" />
          <div id="shoe-group-panel" role="tabpanel" aria-labelledby={`shoe-group-tab-${group}`}>
            <fieldset className="sizes__grid" disabled={!canEdit}>
              <legend className="sr-only">{group === "adult" ? "Adult" : "Kids"} sizes</legend>
              <div className="sizes__scroll" role="region" aria-label={`${group} sizes editor`} tabIndex={0}>
                <table className="sizes__table sizes__table--edit">
                  <thead><tr>{SHOE_COLUMNS.map((c) => <th key={c.key} scope="col">{c.label}</th>)}<th aria-label="Row actions" /></tr></thead>
                  <tbody>
                    {draft[group].map((row, i) => (
                      <tr key={i}>
                        {SHOE_COLUMNS.map((c) => (
                          <td key={c.key}><input type="number" inputMode="decimal" step={c.step} aria-label={`${c.label}, row ${i + 1}`} value={row[c.key]} onChange={(e) => setDraft(setShoeCell(draft, group, i, c.key, e.target.value))} /></td>
                        ))}
                        <td>{canEdit ? <button type="button" className="sizes__x" aria-label={`Remove ${group} row ${i + 1}`} onClick={() => setDraft(removeShoeRow(draft, group, i))}>×</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit ? <div className="sizes__actions"><Button size="sm" onClick={() => setDraft(addShoeRow(draft, group))}>Add row</Button></div> : null}
            </fieldset>
          </div>
          {!clean.ok ? (
            <div className="sizes__problems" role="alert">
              <strong>Fix these before saving</strong>
              <ul>{clean.errors.slice(0, 6).map((m) => <li key={m}>{m}</li>)}</ul>
              {clean.errors.length > 6 ? <p className="muted">and {clean.errors.length - 6} more.</p> : null}
            </div>
          ) : null}
          {canEdit ? (
            <div className="sizes__footer">
              <Button type="submit" variant="primary" disabled={!dirty || !clean.ok || save.isPending}>{save.isPending ? "Saving" : "Save conversion"}</Button>
              {dirty ? <Button onClick={() => setDraft(shoeToDraft(data.chart))}>Discard changes</Button> : null}
            </div>
          ) : <p className="muted">Only Owners can change the shoe conversion. You can look at it here.</p>}
        </form>
      </div>

      <aside className="sizes__preview" aria-label="What the buyer sees">
        <h3 className="heading-sm">What the buyer sees</h3>
        <div className="sizes__seg" role="group" aria-label="Preview for">
          {["men", "women", "kids"].map((a) => <button key={a} type="button" aria-pressed={audience === a} onClick={() => setAudience(a)}>{a === "men" ? "Men" : a === "women" ? "Women" : "Kids"}</button>)}
        </div>
        {preview?.ok ? <ChartTable columns={previewColumns} rows={previewRows} caption={`${audience} shoe sizes`} /> : <p className="muted" role="status">The preview appears once the chart is valid.</p>}
      </aside>
    </div>
  );
}

export default function SizeChartsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState("charts");
  const canEdit = can("sizes.edit");
  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Size charts</h2></div>
        <p className="muted">The tables buyers open beside a size, and the shoe conversion behind “EU 42 · UK 8 · US 9”. Edits show at once and never change sizes already stored on items.</p>
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Size tools" idPrefix="sizes" />
        <div id="sizes-panel" role="tabpanel" aria-labelledby={`sizes-tab-${tab}`}>
          {tab === "charts" ? <ChartsTab canEdit={canEdit} /> : <ShoeTab canEdit={canEdit} />}
        </div>
      </section>
    </div>
  );
}
