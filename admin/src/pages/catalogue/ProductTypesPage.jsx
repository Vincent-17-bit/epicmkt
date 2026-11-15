import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listScales } from "@epicmkt/shared";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import * as M from "../../lib/productTypes.js";

const KEY = "admin-product-types";
const NEW = "__new";
// The scales an option can measure with (shared/src/scales): shoe sizes, storage, volume, screen size ...
const SCALES = listScales().map((s) => [s.id, s.label ?? s.id]).sort((a, b) => a[1].localeCompare(b[1]));
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function AxisCard({ axis, index, count, canEdit, onSet, onMove, onRemove }) {
  const uid = useId();
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
        <label className="field">Measured with
          <select value={axis.scale} onChange={(e) => onSet(index, { scale: e.target.value })} aria-describedby={`${uid}-scale`}>
            <option value="">No scale (plain names)</option>
            {SCALES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
        <label className="field">Price changes with it
          <select value={axis.affectsPrice} onChange={(e) => onSet(index, { affectsPrice: e.target.value })}>
            {M.AFFECTS_PRICE.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
      </div>
      <p className="muted" id={`${uid}-scale`}>A scale sorts and checks values (EU 42 after EU 41.5, 1 TB after 512 GB) and converts them for buyers.</p>
      <div className="sc-row">
        <label className="field pt-check">
          <span><input type="checkbox" checked={axis.open} onChange={(e) => onSet(index, { open: e.target.checked })} /> Sellers can type their own values</span>
        </label>
        <label className="field pt-check">
          <span><input type="checkbox" checked={axis.optional} onChange={(e) => onSet(index, { optional: e.target.checked })} /> Sellers may leave this option out</span>
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

function CategoryChecks({ legend, hint, categories, chosen, onToggle, canEdit }) {
  return (
    <fieldset className="sc-card" disabled={!canEdit}>
      <legend className="heading-sm">{legend}</legend>
      {hint && <p className="muted">{hint}</p>}
      {categories.length === 0 && <p className="muted">No categories yet.</p>}
      <div className="sc-row">
        {categories.map((c) => (
          <label key={c.id} className="field pt-check">
            <span><input type="checkbox" checked={chosen.includes(c.id)} onChange={() => onToggle(c.id)} /> {c.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Status({ type, isNew }) {
  if (isNew) return <p className="pt-status"><span className="status-pill status-pill--neutral">New type</span> Save a draft, then publish it to let sellers use it.</p>;
  return (
    <p className="pt-status" aria-live="polite">
      <span className={`status-pill ${type.version ? "status-pill--live" : "status-pill--neutral"}`}>{type.version ? `Live: version ${type.version}` : "Not published"}</span>
      {type.draft
        ? <span className="status-pill status-pill--degraded">Draft saved {when(type.draftUpdatedAt)}, not live yet</span>
        : <span className="muted">{M.versionText(type)}. Changes are kept as a draft until you publish them.</span>}
    </p>
  );
}

function Editor({ type, isNew, departments, categories, sizeCharts, canEdit, busy, error, onDraft, onPublish, onDiscardDraft }) {
  const uid = useId();
  const [draft, setDraft] = useState(() => M.toDraft(type));
  const [note, setNote] = useState("");
  const v = useMemo(() => M.validate(draft), [draft]);
  const dirty = isNew ? true : M.isDirty(draft, type);
  const publishable = isNew || dirty || Boolean(type?.draft) || M.differsFromLive(draft, type);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    if (!dirty || isNew) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, isNew]);

  const setAxis = (i, patch) => set({ axes: draft.axes.map((a, k) => (k === i ? { ...a, ...patch } : a)) });
  const moveAxis = (i, by) => {
    const axes = [...draft.axes];
    [axes[i], axes[i + by]] = [axes[i + by], axes[i]];
    set({ axes });
  };
  const toggle = (field) => (id) => set({ [field]: draft[field].includes(id) ? draft[field].filter((c) => c !== id) : [...draft[field], id] });
  const id = isNew ? M.typeId(draft.name) : draft.id;
  const next = (type?.version ?? 0) + 1;

  return (
    <div className="sc-editor__main">
      {!isNew && <Status type={type} isNew={false} />}
      {isNew && <Status isNew />}
      <div className="sc-row">
        <label className="field">Name
          <input value={draft.name} maxLength={60} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">What it is
          <select value={draft.kind} disabled={!canEdit} onChange={(e) => set({ kind: e.target.value })}>
            {M.KINDS.map(([k, text]) => <option key={k} value={k}>{text}</option>)}
          </select>
        </label>
        <label className="field">Department
          <select value={draft.departmentId} disabled={!canEdit} onChange={(e) => set({ departmentId: e.target.value })}>
            <option value="">None</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>
      <div className="sc-row">
        <label className="field">How buyers choose a quantity
          <select value={draft.quantityMode} disabled={!canEdit} onChange={(e) => set({ quantityMode: e.target.value })}>
            {M.QUANTITY_MODES.map(([k, text]) => <option key={k} value={k}>{text}</option>)}
          </select>
        </label>
        <label className="field">Size chart
          <select value={draft.sizeChartId} disabled={!canEdit} onChange={(e) => set({ sizeChartId: e.target.value })}>
            <option value="">No size chart</option>
            {sizeCharts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <CategoryChecks legend="Categories that can sell it" hint="Shops in these categories see the type first when they add an item." categories={categories} chosen={draft.categoryIds} onToggle={toggle("categoryIds")} canEdit={canEdit} />
      <CategoryChecks
        legend="Only these shop categories may sell it"
        hint={draft.restrictedTo.length ? `Restricted: only ${draft.restrictedTo.length === 1 ? "one category" : `${draft.restrictedTo.length} categories`} can list it.` : "Not restricted: any shop may sell it. Tick categories to restrict it (for example liquor, medicine)."}
        categories={categories}
        chosen={draft.restrictedTo}
        onToggle={toggle("restrictedTo")}
        canEdit={canEdit}
      />
      <label className="field pt-check">
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
      <div className="sc-footer pt-footer">
        <label className="field pt-note" htmlFor={`${uid}-note`}>Version note (optional)
          <input id={`${uid}-note`} value={note} maxLength={200} disabled={!canEdit} placeholder="What changed, for the audit log" onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button onClick={() => onDraft(id, v.type)} disabled={!canEdit || !v.ok || !dirty || busy}>{busy === "draft" ? "Saving" : "Save draft"}</Button>
        <Button variant="primary" onClick={() => onPublish(id, dirty ? v.type : null, note)} disabled={!canEdit || !v.ok || !publishable || Boolean(busy)}>
          {busy === "publish" ? "Publishing" : `Publish version ${next}`}
        </Button>
        {type?.draft && <Button onClick={() => onDiscardDraft(id)} disabled={!canEdit || Boolean(busy)}>Discard draft</Button>}
        <Button onClick={() => setDraft(M.toDraft(type))} disabled={!dirty || isNew || Boolean(busy)}>Undo unsaved changes</Button>
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
  // A new type saved as a draft only is listed too, so the admin can come back and publish it.
  const pending = (data.data?.newDrafts ?? []).map((d) => ({ id: d.id, name: d.draft.name, version: null, draft: d.draft, draftUpdatedAt: d.draftUpdatedAt, items: 0, axes: [], categoryIds: [] }));
  const list = [...(data.data?.types ?? []), ...pending];
  const adding = picked === NEW;
  const type = adding ? null : list.find((t) => t.id === picked) ?? list[0] ?? null;
  const canEdit = can("producttypes.edit");
  const refresh = (id) => {
    setPicked(id);
    queryClient.invalidateQueries({ queryKey: [KEY] });
  };

  const draftSave = useMutation({
    mutationFn: ({ id, input }) => api.saveTypeDraft(id, input),
    onSuccess: (saved) => {
      toast.push({ message: `Draft of “${saved.draft.name}” saved. Live items are unchanged until you publish.` });
      refresh(saved.id);
    },
  });
  const publish = useMutation({
    mutationFn: async ({ id, input, note }) => {
      if (input) await api.saveTypeDraft(id, input);
      return api.publishTypeVersion(id, note);
    },
    onSuccess: (r) => {
      toast.push({ message: `Published “${r.name}” as version ${r.version}.` });
      refresh(r.id);
    },
  });
  const discard = useMutation({
    mutationFn: (id) => api.discardTypeDraft(id),
    onSuccess: (r) => {
      toast.push({ message: "Draft discarded. The live type is unchanged." });
      refresh(r.id);
    },
  });
  const busy = draftSave.isPending ? "draft" : publish.isPending ? "publish" : discard.isPending ? "discard" : null;
  const failed = [draftSave, publish, discard].find((m) => m.isError);
  const reset = () => [draftSave, publish, discard].forEach((m) => m.reset());

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header"><h2 className="heading-sm">Product types</h2></div>
        <p className="muted">A type decides where an item is listed, which options sellers can price (such as Colour and Storage), how buyers pick a quantity and which size chart they see. Edits are saved as a draft; live items change only when you publish a version. Spec rows are edited under Spec rules.{!canEdit && ` ${why("producttypes.edit") ?? ""}`}</p>
        {data.isError && <LoadError what="the product types" error={data.error} onRetry={() => data.refetch()} />}
        {data.isPending && <p className="muted">Loading</p>}
        {data.data && (
          <>
            <div className="sc-row">
              <label className="field">Product type
                <select value={adding ? NEW : type?.id ?? ""} onChange={(e) => { reset(); setPicked(e.target.value); }}>
                  {list.map((t) => <option key={t.id} value={t.id}>{t.name}{t.version ? "" : " (draft, not published)"}{t.active === false ? " (hidden)" : ""}{t.version && t.draft ? " (draft waiting)" : ""}</option>)}
                  {canEdit && <option value={NEW}>New type</option>}
                </select>
              </label>
              {type && <p className="muted">{type.items} {type.items === 1 ? "item uses" : "items use"} this type.</p>}
            </div>
            {(adding || type) && (
              <Editor
                key={adding ? NEW : `${type.id}:${JSON.stringify(type)}`}
                type={adding ? null : type}
                isNew={adding}
                departments={data.data.departments}
                categories={data.data.categories}
                sizeCharts={data.data.sizeCharts ?? []}
                canEdit={canEdit}
                busy={busy}
                error={failed ? M.saveError(failed.error) : null}
                onDraft={(id, input) => draftSave.mutate({ id, input })}
                onPublish={(id, input, note) => publish.mutate({ id, input, note })}
                onDiscardDraft={(id) => discard.mutate(id)}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
