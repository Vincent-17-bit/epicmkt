import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import * as M from "../../lib/specRules.js";
import ConditionEditor from "./specRules/ConditionEditor.jsx";
import FormPreview from "./specRules/FormPreview.jsx";

const KEY = "admin-spec-rules";

function RowCard({ rows, index, canEdit, onSet, onMove, onRemove }) {
  const row = rows[index];
  const labelOf = (key) => rows.find((r) => r.key === key)?.label || key;
  return (
    <fieldset className="sc-card" disabled={!canEdit}>
      <legend className="heading-sm">Row {index + 1}{row.label.trim() ? `: ${row.label.trim()}` : ""}</legend>
      <div className="sc-row">
        <label className="field">Label
          <input value={row.label} maxLength={60} onChange={(e) => onSet(index, { label: e.target.value })} />
        </label>
        <label className="field">Level
          <select value={row.level} onChange={(e) => onSet(index, { level: e.target.value })}>
            {M.LEVELS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
        <label className="field">Input
          <select value={row.input} onChange={(e) => onSet(index, { input: e.target.value })}>
            {M.INPUTS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
      </div>
      {row.input === "choice" && (
        <div className="sc-row">
          <label className="field">Label set
            <select value={row.labelSet} onChange={(e) => onSet(index, { labelSet: e.target.value })}>
              <option value="">Own choices</option>
              {M.LABEL_SET_OPTIONS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>
          </label>
          {!row.labelSet && (
            <label className="field">Choices, comma separated
              <input value={row.choicesText} onChange={(e) => onSet(index, { choicesText: e.target.value })} />
            </label>
          )}
        </div>
      )}
      <ConditionEditor legend="Required when" value={row.requiredIf} rows={rows} ownKey={row.key} onChange={(v) => onSet(index, { requiredIf: v })} disabled={!canEdit} />
      <ConditionEditor legend="Shown only when" value={row.showIf} rows={rows} ownKey={row.key} onChange={(v) => onSet(index, { showIf: v })} disabled={!canEdit} />
      {(row.requiredIf || row.showIf) && <p className="muted">{[row.requiredIf && `Required when ${M.conditionText(row.requiredIf, labelOf)}`, row.showIf && `Shown only when ${M.conditionText(row.showIf, labelOf)}`].filter(Boolean).join(". ")}.</p>}
      <div className="sc-actions">
        <Button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move row ${index + 1} up`}>Move up</Button>
        <Button type="button" onClick={() => onMove(index, 1)} disabled={index === rows.length - 1} aria-label={`Move row ${index + 1} down`}>Move down</Button>
        <Button type="button" onClick={() => onRemove(index)} aria-label={`Remove row ${index + 1}`}>Remove row</Button>
      </div>
    </fieldset>
  );
}

function Editor({ type, canEdit, saving, error, onSave }) {
  const [rows, setRows] = useState(() => M.fromRows(type.specRows));
  const [note, setNote] = useState("");
  const v = useMemo(() => M.validate(rows), [rows]);
  const dirty = M.isDirty(rows, type.specRows);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const remove = (i) => {
    const next = M.removeRow(rows, i);
    if (!next) { setNote(`Another row uses “${rows[i].label || rows[i].key}” in a rule. Remove that rule first.`); return; }
    setRows(next);
    setNote(`Row ${i + 1} removed.`);
  };

  return (
    <div className="sc-editor__grid">
      <div className="sc-editor__main">
        <div className="sr-head">
          <p role="status" className={v.required > M.MAX_REQUIRED_ROWS ? "sc-error" : "muted"}>Required rows: {v.required} of {M.MAX_REQUIRED_ROWS}. A row with a “required when” rule counts.</p>
          <Button type="button" onClick={() => { setRows(M.addRow(rows)); setNote("Row added."); }} disabled={!canEdit}>Add row</Button>
        </div>
        {rows.length === 0 && <p className="muted">This type has no rows yet. Sellers see the generic template.</p>}
        {rows.map((r, i) => (
          <RowCard key={r.id} rows={rows} index={i} canEdit={canEdit} onSet={(idx, p) => setRows(M.setRow(rows, idx, p))} onMove={(idx, by) => setRows(M.moveRow(rows, idx, by))} onRemove={remove} />
        ))}
        <p className="sr-only" role="status">{note}</p>
        {v.errors.length > 0 && <ul className="sc-error" role="alert">{v.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        {error && <p className="sc-error" role="alert">{error}</p>}
        <div className="sc-footer">
          <Button variant="primary" onClick={() => onSave(v.rows)} disabled={!canEdit || !v.ok || !dirty || saving}>{saving ? "Saving" : "Save rules"}</Button>
          <Button onClick={() => setRows(M.fromRows(type.specRows))} disabled={!dirty || saving}>Discard changes</Button>
        </div>
      </div>
      <div className="sc-editor__side"><FormPreview rows={v.rows} /></div>
    </div>
  );
}

export default function SpecRulesPage() {
  const { can, why } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState("");
  const types = useQuery({ queryKey: [KEY], queryFn: () => api.listSpecTypes() });
  const list = types.data ?? [];
  const type = list.find((t) => t.id === picked) ?? list[0] ?? null;
  const canEdit = can("specrules.edit");

  const save = useMutation({
    mutationFn: (rows) => api.saveSpecRows(type.id, rows),
    onSuccess: () => { toast.push({ message: `Saved the rules for “${type.name}”.` }); queryClient.invalidateQueries({ queryKey: [KEY] }); },
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Spec rules</h2></div>
        <p className="muted">Each product type lists the rows a seller fills in. Required rows block publishing, recommended rows lower the quality score. Changes apply the next time a seller saves an item.{!canEdit && ` ${why("specrules.edit") ?? ""}`}</p>
        {types.isError && <LoadError what="the product types" error={types.error} onRetry={() => types.refetch()} />}
        {types.isPending && <p className="muted">Loading</p>}
        {type && (
          <>
            <label className="field">Product type
              <select value={type.id} onChange={(e) => { save.reset(); setPicked(e.target.value); }}>
                {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <Editor key={`${type.id}:${JSON.stringify(type.specRows)}`} type={type} canEdit={canEdit} saving={save.isPending} error={save.isError ? M.saveError(save.error) : null} onSave={(rows) => save.mutate(rows)} />
          </>
        )}
      </section>
    </div>
  );
}
