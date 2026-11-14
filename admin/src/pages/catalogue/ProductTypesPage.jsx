import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import * as M from "../../lib/productTypes.js";

const KEY = "admin-product-types";
const NEW = "__new";

function AxisCard({ axis, index, count, canEdit, onSet, onMove, onRemove }) {
  return (
    <fieldset className="sc-card" disabled={!canEdit}>
      <legend className="heading-sm">Option {index + 1}{axis.label.trim() ? `: ${axis.label.trim()}` : ""}</legend>
      <div className="sc-row">
        <label className="field">Name
          <input value={axis.label} maxLength={40} onChange={(e) => onSet(index, { label: e.target.value })} />
        </label>
        <label className="field">Shown as
          <select value={axis.display} onChange={(e) => onSet(index, { display: e.target.value })}>
            {M.DISPLAYS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Suggested values, comma separated
        <input value={axis.suggestedText} onChange={(e) => onSet(index, { suggestedText: e.target.value })} placeholder="64 GB, 128 GB, 256 GB" />
      </label>
      <div className="sc-actions">
        <Button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move option ${index + 1} up`}>Move up</Button>
        <Button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move option ${index + 1} down`}>Move down</Button>
        <Button type="button" onClick={() => onRemove(index)} aria-label={`Remove option ${index + 1}`}>Remove option</Button>
      </div>
    </fieldset>
  );
}

function Editor({ type, departments, categories, canEdit, saving, error, onSave }) {
  const [draft, setDraft] = useState(() => M.toDraft(type));
  const v = useMemo(() => M.validate(draft), [draft]);
  const dirty = draft.isNew ? true : M.isDirty(draft, type);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (!dirty || draft.isNew) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, draft.isNew]);

  const setAxis = (i, patch) => set({ axes: draft.axes.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const moveAxis = (i, by) => {
    const axes = [...draft.axes];
    [axes[i], axes[i + by]] = [axes[i + by], axes[i]];
    set({ axes });
  };
  const toggleCategory = (id) => set({ categoryIds: draft.categoryIds.includes(id) ? draft.categoryIds.filter((c) => c !== id) : [...draft.categoryIds, id] });

  return (
    <div className="sc-editor__main">
      <div className="sc-row">
        <label className="field">Name
          <input value={draft.name} maxLength={60} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">Department
          <select value={draft.departmentId} disabled={!canEdit} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="sc-card" disabled={!canEdit}>
        <legend className="heading-sm">Categories that can sell it</legend>
        {categories.length === 0 && <p className="muted">No categories yet.</p>}
        <div className="sc-row">
          {categories.map((c) => (
            <label key={c.id} className="field">
              <span><input type="checkbox" checked={draft.categoryIds.includes(c.id)} onChange={() => toggleCategory(c.id)} /> {c.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span><input type="checkbox" checked={draft.active} disabled={!canEdit} onChange={(e) => set({ active: e.target.checked })} /> Sellers can pick this type</span>
      </label>
      <div className="sr-head">
        <p className="muted">Options sellers price per combination, for example Colour and Storage.</p>
        <Button type="button" onClick={() => set({ axes: [...draft.axes, M.blankAxis()] })} disabled={!canEdit || draft.axes.length >= M.MAX_AXES}>Add option</Button>
      </div>
      {draft.axes.length === 0 && <p className="muted">No options. Items of this type have one price.</p>}
      {draft.axes.map((a, i) => (
        <AxisCard key={a.uid} axis={a} index={i} count={draft.axes.length} canEdit={canEdit} onSet={setAxis} onMove={moveAxis} onRemove={(idx) => set({ axes: draft.axes.filter((_, k) => k !== idx) })} />
      ))}
      {v.errors.length > 0 && <ul className="sc-error" role="alert">{v.errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {error && <p className="sc-error" role="alert">{error}</p>}
      <div className="sc-footer">
        <Button variant="primary" onClick={() => onSave(draft.isNew ? M.typeId(draft.name) : draft.id, v.type)} disabled={!canEdit || !v.ok || !dirty || saving}>{saving ? "Saving" : draft.isNew ? "Create type" : "Save type"}</Button>
        <Button onClick={() => setDraft(M.toDraft(type))} disabled={!dirty || saving}>Discard changes</Button>
      </div>
    </div>
  );
}

export default function ProductTypesPage() {
  const { can, why } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState("");
  const data = useQuery({ queryKey: [KEY], queryFn: () => api.listTypeSettings() });
  const list = data.data?.types ?? [];
  const adding = picked === NEW;
  const type = adding ? null : list.find((t) => t.id === picked) ?? list[0] ?? null;
  const canEdit = can("producttypes.edit");

  const save = useMutation({
    mutationFn: ({ id, input }) => api.saveTypeSettings(id, input),
    onSuccess: (saved) => {
      toast.push({ message: `Saved “${saved.name}”.` });
      setPicked(saved.id);
      queryClient.invalidateQueries({ queryKey: [KEY] });
    },
  });

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Product types</h2></div>
        <p className="muted">A type decides where an item is listed and which options sellers can price, such as Colour and Storage. Spec rows are edited under Spec rules. Changes apply the next time a seller opens the type.{!canEdit && ` ${why("producttypes.edit") ?? ""}`}</p>
        {data.isError && <LoadError what="the product types" error={data.error} onRetry={() => data.refetch()} />}
        {data.isPending && <p className="muted">Loading</p>}
        {data.data && (
          <>
            <div className="sc-row">
              <label className="field">Product type
                <select value={adding ? NEW : type?.id ?? ""} onChange={(e) => { save.reset(); setPicked(e.target.value); }}>
                  {list.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (hidden)"}</option>)}
                  {canEdit && <option value={NEW}>New type</option>}
                </select>
              </label>
              {type && <p className="muted">{type.items} {type.items === 1 ? "item uses" : "items use"} this type.</p>}
            </div>
            {(adding || type) && (
              <Editor
                key={adding ? NEW : `${type.id}:${JSON.stringify(type)}`}
                type={adding ? null : type}
                departments={data.data.departments}
                categories={data.data.categories}
                canEdit={canEdit}
                saving={save.isPending}
                error={save.isError ? M.saveError(save.error) : null}
                onSave={(id, input) => save.mutate({ id, input })}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
