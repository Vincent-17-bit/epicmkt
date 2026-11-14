import { useId, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { applyPlan, buildKit, cloneType, diffKit, failureText, freeTypeId, kitCounts, kitFileName, kitText, parseKit, planImport } from "../../lib/kit.js";

const ACTION = { add: ["New", "status-pill--live"], change: ["Changes", "status-pill--degraded"], same: ["Same", "status-pill--neutral"] };
const ENTITY = { type: "Product type", specRows: "Spec rules", sizeChart: "Size chart", value: "Open value" };

// Everything a kit reads, loaded together. Open values come in pages of 200 (the api's limit).
function useKitEnv() {
  const types = useQuery({ queryKey: ["admin-product-types"], queryFn: () => api.listTypeSettings() });
  const specTypes = useQuery({ queryKey: ["admin-spec-types"], queryFn: () => api.listSpecTypes() });
  const sizeCharts = useQuery({ queryKey: ["admin-size-charts"], queryFn: () => api.listSizeCharts() });
  const values = useQuery({
    queryKey: ["admin-approved-values"],
    queryFn: async () => {
      const out = [];
      for (let offset = 0; offset < 2000; offset += 200) {
        const page = await api.listOptionValues({ status: "approved", limit: 200, offset });
        out.push(...page.values);
        if (out.length >= page.total) break;
      }
      return out;
    }
  });
  const env = useMemo(() => (types.data && specTypes.data && sizeCharts.data && values.data
    ? { types: types.data.types, departments: types.data.departments ?? [], categories: types.data.categories ?? [], specTypes: specTypes.data, sizeCharts: sizeCharts.data, values: values.data } : null),
  [types.data, specTypes.data, sizeCharts.data, values.data]);
  const failed = [types, specTypes, sizeCharts, values].find((q) => q.isError);
  return { env, loading: !env && !failed, error: failed?.error, retry: () => [types, specTypes, sizeCharts, values].forEach((q) => q.isError && q.refetch()) };
}

function ExportSection({ env }) {
  const uid = useId();
  const categories = useMemo(() => {
    const names = new Map(env.categories.map((c) => [c.id, c.name]));
    return [...new Set(env.types.flatMap((t) => t.categoryIds ?? []))].map((id) => ({ id, name: names.get(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name));
  }, [env]);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [withValues, setWithValues] = useState(true);
  const toast = useToast();
  const category = categories.find((c) => c.id === categoryId);
  const kit = useMemo(() => (category ? buildKit({ category, types: env.types, specTypes: env.specTypes, sizeCharts: env.sizeCharts, values: withValues ? env.values : null }) : null), [category, env, withValues]);
  const text = kit ? kitText(kit) : "";
  const counts = kit ? kitCounts(kit) : null;

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: kitFileName(kit) });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); toast.push({ message: "Kit copied." }); } catch { toast.push({ message: "Could not copy. Use Download instead." }); }
  };

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h2 className="heading-sm" id={`${uid}-t`}>Export a kit</h2></div>
      <p className="muted">A kit is everything a category sells: its product types with their options and spec rules, the size charts those types use, and the approved open values. It carries no ids that belong to this environment.</p>
      {categories.length === 0 ? <p className="muted">No category has a product type yet.</p> : (
        <>
          <div className="kit-row">
            <label className="field">Category
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="kit-check"><input type="checkbox" checked={withValues} onChange={(e) => setWithValues(e.target.checked)} /><span>Include approved open values (they belong to no category, so all are included)</span></label>
          </div>
          {counts ? <p aria-live="polite"><strong>{counts.types} {counts.types === 1 ? "type" : "types"}, {counts.specRows} spec rows, {counts.sizeCharts} size {counts.sizeCharts === 1 ? "chart" : "charts"}{withValues ? `, ${counts.values} values` : ""}</strong></p> : null}
          <div className="kit-row"><Button variant="primary" onClick={download}>Download JSON</Button><Button onClick={copy}>Copy</Button></div>
          <details><summary>See the kit</summary><pre className="kit-pre" tabIndex={0}>{text}</pre></details>
        </>
      )}
    </section>
  );
}

function ImportSection({ env, canEdit, why }) {
  const uid = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [read, setRead] = useState(null);       // { ok, kit } | { ok: false, errors }
  const [diff, setDiff] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const reset = () => { setRead(null); setDiff(null); setOutcome(null); setProgress(null); };
  const check = (source = text) => {
    reset();
    const r = parseKit(source);
    setRead(r);
    if (r.ok) setDiff(diffKit(r.kit, env));
  };
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    check(content);
  };
  const run = async () => {
    setBusy(true); setOutcome(null);
    const plan = planImport(diff);
    const result = await applyPlan(plan, api, { onProgress: (n, total) => setProgress([n, total]) });
    setBusy(false);
    for (const key of ["admin-product-types", "admin-spec-types", "admin-size-charts", "admin-approved-values", "admin-categories"]) queryClient.invalidateQueries({ queryKey: [key] });
    if (result.ok) {
      toast.push({ message: `Kit imported: ${result.applied} ${result.applied === 1 ? "change" : "changes"} applied.` });
      setOutcome({ ok: true, text: `${result.applied} ${result.applied === 1 ? "change" : "changes"} applied. Each is in the audit log.` });
      setDiff(null); setRead(null); setText("");
    } else {
      setOutcome({ ok: false, text: `Stopped after ${result.applied} of ${result.total}. ${failureText(result.failed)} What was applied stays applied. Fix the cause and read the kit again; it will only list what is left.` });
    }
  };

  const todo = diff ? diff.counts.add + diff.counts.change : 0;
  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h2 className="heading-sm" id={`${uid}-t`}>Import a kit</h2></div>
      <p className="muted">Read a kit file and see exactly what would change before anything is saved. An import only adds: it never removes a category from a type, a type from a size chart or a value. Importing the same kit twice changes nothing the second time.</p>
      <div className="kit-row">
        <label className="field">Kit file<input type="file" accept="application/json,.json" onChange={onFile} /></label>
      </div>
      <label className="field">Or paste the kit<textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); reset(); }} spellCheck={false} /></label>
      <div className="kit-row"><Button onClick={() => check()} disabled={!text.trim() || busy}>Check the kit</Button></div>

      {read && !read.ok ? <div role="alert" className="modal__error"><p>This kit cannot be used:</p><ul>{read.errors.slice(0, 12).map((m, i) => <li key={i}>{m}</li>)}</ul>{read.errors.length > 12 ? <p>And {read.errors.length - 12} more.</p> : null}</div> : null}

      {diff ? (
        <div aria-live="polite">
          <p><strong>For “{read.kit.category.name}”: {diff.counts.add} new, {diff.counts.change} to change, {diff.counts.same} the same.</strong></p>
          {diff.entries.length === 0 ? <p className="muted">The kit is empty.</p> : (
            <div className="table-shell">
              <table>
                <thead><tr><th scope="col">What</th><th scope="col">Name</th><th scope="col">Result</th><th scope="col">Detail</th></tr></thead>
                <tbody>
                  {diff.entries.map((e) => (
                    <tr key={`${e.entity}:${e.key}`}>
                      <td>{ENTITY[e.entity]}</td>
                      <td>{e.label}</td>
                      <td><span className={`status-pill ${ACTION[e.action][1]}`}>{ACTION[e.action][0]}</span></td>
                      <td>{[...e.changes, e.note ? `Note: ${e.note}` : null].filter(Boolean).join(" · ") || <span className="muted">Nothing to do</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="kit-row">
            <Button variant="primary" disabled={!canEdit || todo === 0 || busy} title={why("producttypes.edit")} onClick={run}>{busy ? `Importing ${progress?.[0] ?? 0} of ${progress?.[1] ?? todo}` : todo === 0 ? "Nothing to import" : `Import ${todo} ${todo === 1 ? "change" : "changes"}`}</Button>
            <Button onClick={() => { reset(); setText(""); }} disabled={busy}>Start over</Button>
          </div>
        </div>
      ) : null}
      {outcome ? <p role={outcome.ok ? "status" : "alert"} className={outcome.ok ? "readiness-ok" : "modal__error"}>{outcome.text}</p> : null}
    </section>
  );
}

function CloneSection({ env, canEdit, why }) {
  const uid = useId();
  const queryClient = useQueryClient();
  const toast = useToast();
  const sorted = useMemo(() => [...env.types].sort((a, b) => a.name.localeCompare(b.name)), [env.types]);
  const [typeId, setTypeId] = useState(sorted[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const type = env.types.find((t) => t.id === typeId);
  const taken = env.types.map((t) => t.id);
  const preview = type && name.trim().length >= 2 ? freeTypeId(name.trim(), taken) : null;

  const run = async (e) => {
    e.preventDefault();
    const made = cloneType({ type, specRows: env.specTypes.find((s) => s.id === type.id)?.specRows ?? [], name, takenIds: taken });
    if (!made.ok) { setMessage({ ok: false, text: made.error }); return; }
    setBusy(true); setMessage(null);
    const plan = [{ op: "saveTypeSettings", label: made.input.name, args: [made.id, made.input] }, ...(made.specRows.length ? [{ op: "saveSpecRows", label: `${made.input.name}: spec rules`, args: [made.id, made.specRows] }] : [])];
    const result = await applyPlan(plan, api);
    setBusy(false);
    for (const key of ["admin-product-types", "admin-spec-types"]) queryClient.invalidateQueries({ queryKey: [key] });
    if (result.ok) { toast.push({ message: `Cloned as “${made.input.name}”. It is switched off until you look at it.` }); setMessage({ ok: true, text: `Created “${made.input.name}” (${made.id}), switched off. Open Product types to check its options and switch it on.` }); setName(""); }
    else setMessage({ ok: false, text: failureText(result.failed) });
  };

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h2 className="heading-sm" id={`${uid}-t`}>Clone a type</h2></div>
      <p className="muted">Copies a type's options, spec rules, department and categories under a new name. The copy starts switched off, and no size chart is attached to it.</p>
      <form className="kit-row" onSubmit={run}>
        <label className="field">Type to copy
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>{sorted.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        <label className="field">Name of the copy
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-describedby={`${uid}-id`} />
          <span className="muted" id={`${uid}-id`}>{preview ? `Id: ${preview}` : "Type a name of 2 to 60 characters."}</span>
        </label>
        <Button type="submit" variant="primary" disabled={!canEdit || !preview || busy} title={why("producttypes.edit")}>{busy ? "Cloning" : "Clone type"}</Button>
      </form>
      {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "readiness-ok" : "modal__error"}>{message.text}</p> : null}
    </section>
  );
}

export default function KitPage() {
  const { can, why } = usePermissions();
  const { env, loading, error, retry } = useKitEnv();
  const canEdit = can("producttypes.edit");
  return (
    <div className="page-shell">
      {error ? <LoadError what="the catalogue" error={error} onRetry={retry} /> : loading ? <section className="panel"><span className="skeleton" /></section> : (
        <>
          <ExportSection env={env} />
          <ImportSection env={env} canEdit={canEdit} why={why} />
          <CloneSection env={env} canEdit={canEdit} why={why} />
        </>
      )}
    </div>
  );
}
