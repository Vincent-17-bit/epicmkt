import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";

export const RELATION_ERRORS = {
  invalid_relation_kind: "Pick a type or a department on each side.",
  relation_to_self: "Pick two different things: a kind of product is already related to itself.",
  invalid_relation_weight: "The strength is a whole number from 0 to 10.",
  unknown_relation_target: "One of the two no longer exists. Reload the page.",
  relation_not_found: "This relation was already removed.",
  forbidden: "Only an owner can change relations."
};
const message = (e) => RELATION_ERRORS[e?.code ?? e?.message] ?? "Could not save. Try again.";
const KIND = { type: "Type", department: "Department" };

/** What shoppers are shown beside an item ("You may also like"): pairs of types or departments, with a strength from 0 to 10. */
export default function RelationsPage() {
  const uid = useId();
  const qc = useQueryClient();
  const { can, why } = usePermissions();
  const canEdit = can("producttypes.edit");
  const q = useQuery({ queryKey: ["admin-relations"], queryFn: () => api.listRelations() });
  const [draft, setDraft] = useState({ fromKind: "type", fromId: "", toKind: "type", toId: "", weight: "5" });
  const [notice, setNotice] = useState(null);
  const done = (text) => { setNotice({ ok: true, text }); qc.invalidateQueries({ queryKey: ["admin-relations"] }); };
  const fail = (e) => setNotice({ ok: false, text: message(e) });

  const save = useMutation({ mutationFn: (r) => api.saveRelation(r), onSuccess: (_, v) => { done(v.created ? "Relation added." : "Saved."); if (v.created) setDraft((d) => ({ ...d, fromId: "", toId: "" })); }, onError: fail });
  const remove = useMutation({ mutationFn: (id) => api.deleteRelation(id), onSuccess: () => done("Relation removed."), onError: fail });

  const options = (kind) => (kind === "type" ? q.data?.types : q.data?.departments) ?? [];
  const add = (e) => {
    e.preventDefault();
    save.mutate({ ...draft, weight: Number(draft.weight), active: true, created: true });
  };
  const Side = ({ side, label }) => (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{label}</legend>
      <select aria-label={`${label} kind`} value={draft[`${side}Kind`]} onChange={(e) => setDraft({ ...draft, [`${side}Kind`]: e.target.value, [`${side}Id`]: "" })}>
        {Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select aria-label={`${label} name`} value={draft[`${side}Id`]} onChange={(e) => setDraft({ ...draft, [`${side}Id`]: e.target.value })} required>
        <option value="">Choose…</option>
        {options(draft[`${side}Kind`]).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </fieldset>
  );

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h2 className="heading-sm" id={`${uid}-t`}>Relations</h2></div>
      <p className="muted">When a shopper looks at an item, these pairs decide what else is shown beside it. A higher strength shows it sooner. Turn a relation off to keep it without using it.</p>

      {canEdit ? (
        <form className="kit-row" onSubmit={add} aria-label="Add a relation">
          <Side side="from" label="When viewing" />
          <Side side="to" label="Also show" />
          <label className="field">Strength (0 to 10)
            <input type="number" min={0} max={10} step={1} inputMode="numeric" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value })} required />
          </label>
          <Button type="submit" variant="primary" disabled={save.isPending || !draft.fromId || !draft.toId}>Add relation</Button>
        </form>
      ) : <p className="muted">{why("producttypes.edit")}</p>}
      <p role="status" className={notice?.ok === false ? "error-text" : "muted"}>{notice?.text}</p>

      {q.isError ? <LoadError onRetry={() => q.refetch()} /> : null}
      {q.isPending ? <p className="muted" role="status">Loading…</p> : null}
      {q.data ? (q.data.relations.length === 0 ? <p className="muted">No relations yet. Items fall back to others of the same type.</p> : (
        <div className="table-shell">
          <table>
            <caption className="sr-only">Relations</caption>
            <thead><tr><th scope="col">When viewing</th><th scope="col">Also show</th><th scope="col">Strength</th><th scope="col">On</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {q.data.relations.map((r) => (
                <Row key={r.id} rel={r} canEdit={canEdit} busy={save.isPending || remove.isPending}
                  onSave={(fields) => save.mutate({ ...r, ...fields })} onDelete={() => remove.mutate(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )) : null}
    </section>
  );
}

function Row({ rel, canEdit, busy, onSave, onDelete }) {
  const [weight, setWeight] = useState(String(rel.weight));
  const from = `${rel.fromName ?? rel.fromId} (${KIND[rel.fromKind].toLowerCase()})`;
  const to = `${rel.toName ?? rel.toId} (${KIND[rel.toKind].toLowerCase()})`;
  return (
    <tr>
      <td>{from}</td>
      <td>{to}</td>
      <td><input aria-label={`Strength, ${rel.fromName} to ${rel.toName}`} type="number" min={0} max={10} step={1} inputMode="numeric" value={weight} disabled={!canEdit} onChange={(e) => setWeight(e.target.value)} style={{ width: "5rem" }} /></td>
      <td><label><input type="checkbox" checked={rel.active} disabled={!canEdit || busy} onChange={(e) => onSave({ active: e.target.checked })} /> <span className="sr-only">{rel.fromName} to {rel.toName} is on</span><span aria-hidden="true">{rel.active ? "On" : "Off"}</span></label></td>
      <td>
        <Button size="sm" disabled={!canEdit || busy || Number(weight) === rel.weight} onClick={() => onSave({ weight: Number(weight) })}>Save</Button>{" "}
        <Button size="sm" disabled={!canEdit || busy} onClick={onDelete} aria-label={`Remove ${rel.fromName} to ${rel.toName}`}>Remove</Button>
      </td>
    </tr>
  );
}
