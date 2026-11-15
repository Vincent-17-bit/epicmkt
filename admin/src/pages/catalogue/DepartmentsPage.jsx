import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";

export const DEPARTMENT_ERRORS = {
  invalid_id: "The short name can use lowercase letters, numbers and single hyphens only.",
  invalid_name: "Give the department a name of 2 to 60 characters.",
  name_taken: "Another department already has that name.",
  invalid_sort: "The order must be a whole number.",
  department_in_use: "Items still sit in this department. Move them to another department before hiding it.",
  forbidden: "Only an owner or reviewer can change departments."
};
const message = (e) => DEPARTMENT_ERRORS[e?.code ?? e?.message] ?? "Could not save. Try again.";
const slugOf = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** The departments shoppers browse (Phones, Furniture, ...): add, rename, reorder and hide. */
export default function DepartmentsPage() {
  const uid = useId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-departments"], queryFn: () => api.listDepartments() });
  const [draft, setDraft] = useState({ name: "", sort: "" });
  const [notice, setNotice] = useState(null);

  const save = useMutation({
    mutationFn: ({ id, fields }) => api.saveDepartment(id, fields),
    onSuccess: (_, v) => { setNotice({ ok: true, text: v.created ? "Department added." : "Saved." }); if (v.created) setDraft({ name: "", sort: "" }); qc.invalidateQueries({ queryKey: ["admin-departments"] }); },
    onError: (e) => setNotice({ ok: false, text: message(e) })
  });

  const add = (e) => {
    e.preventDefault();
    const fields = { name: draft.name.trim() };
    if (draft.sort !== "") fields.sort = Number(draft.sort);
    save.mutate({ id: slugOf(draft.name), fields, created: true });
  };

  return (
    <section className="panel" aria-labelledby={`${uid}-t`}>
      <div className="panel__header"><h1 className="heading-sm" id={`${uid}-t`}>Departments</h1></div>
      <p className="muted">Departments group product types for shoppers, whatever kind of shop sells them. A phone from a cyber shop appears under Phones.</p>

      <form className="kit-row" onSubmit={add} aria-label="Add a department">
        <label className="field">Name
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} required />
        </label>
        <label className="field">Order
          <input type="number" inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })} />
        </label>
        <Button type="submit" variant="primary" disabled={save.isPending || !slugOf(draft.name)}>Add department</Button>
      </form>
      <p role="status" className={notice?.ok ? "muted" : "error-text"}>{notice?.text}</p>

      {q.isError ? <LoadError onRetry={() => q.refetch()} /> : null}
      {q.isPending ? <p className="muted" role="status">Loading…</p> : null}
      {q.data ? (
        <div className="table-shell">
          <table>
            <caption className="sr-only">Departments</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Order</th><th scope="col">Types</th><th scope="col">Items</th><th scope="col">Shown</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {q.data.map((d) => <Row key={d.id} dept={d} busy={save.isPending} onSave={(fields) => save.mutate({ id: d.id, fields })} />)}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Row({ dept, onSave, busy }) {
  const [name, setName] = useState(dept.name);
  const [sort, setSort] = useState(String(dept.sort));
  const changed = name.trim() !== dept.name || Number(sort) !== dept.sort;
  return (
    <tr>
      <td><input aria-label={`Name of ${dept.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></td>
      <td><input aria-label={`Order of ${dept.name}`} type="number" inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: "5rem" }} /></td>
      <td>{dept.types}</td>
      <td>{dept.items}</td>
      <td>
        <label><input type="checkbox" checked={dept.active} disabled={busy} onChange={(e) => onSave({ active: e.target.checked })} /> <span className="sr-only">{dept.name} is shown</span><span aria-hidden="true">{dept.active ? "Shown" : "Hidden"}</span></label>
      </td>
      <td><Button size="sm" disabled={!changed || busy} onClick={() => onSave({ name: name.trim(), sort: Number(sort) })}>Save</Button></td>
    </tr>
  );
}
