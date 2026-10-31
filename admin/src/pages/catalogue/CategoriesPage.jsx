import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { CATEGORY_ERRORS, cleanField, docProblems, templateProblems } from "../../lib/catalogue.js";
import { DocsEditor, QuestionsEditor } from "./TemplateBuilder.jsx";

const blank = { isNew: true, id: "", name: "", grp: "", icon: "store", tier: "B", sort: 100, active: false, template: [], extra_docs: [] };

function CategoryDialog({ initial, groups, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const fieldProblems = templateProblems(form.template);
  const documentProblems = docProblems(form.extra_docs);
  const turningOff = !form.isNew && initial.active && !form.active;
  const idOk = /^[a-z0-9-]{2,50}$/.test(form.id);
  const ready = idOk && form.name.trim().length >= 2 && form.grp.trim().length >= 2 && !Object.keys(fieldProblems).length && !Object.keys(documentProblems).length && (!turningOff || reason.trim().length >= 5);

  const save = useMutation({
    mutationFn: () => api.saveCategory({
      id: form.id, name: form.name.trim(), group: form.grp.trim(), icon: form.icon.trim() || "store", tier: form.tier, sort: Number(form.sort) || 0, active: form.active,
      template: form.template.map(cleanField),
      extraDocs: form.extra_docs.map(({ key, label, rule, why, condition }) => ({ key, label: label.trim(), rule, why: why.trim(), ...(rule === "conditional" ? { condition: condition.trim() } : {}) })),
      reason: reason.trim() || null,
    }),
    onSuccess: (created) => {
      toast.push({ message: created ? "Category created and switched off. Price its plans, then switch it on." : "Category saved." });
      queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      onClose();
    },
  });
  const message = save.isError ? (CATEGORY_ERRORS[save.error.code] ?? save.error.message) : "";

  return (
    <Modal title={form.isNew ? "New category" : `Edit ${initial.name}`} onClose={save.isPending ? () => {} : onClose}>
      <form className="modal__form modal__form--wide" onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate(); }}>
        <div className="builder__row">
          <label className="field">Name<input value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value, ...(form.isNew ? { id: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) } : {}) })} /></label>
          <label className="field">Id (cannot change later)<input value={form.id} disabled={!form.isNew} onChange={(e) => set({ id: e.target.value })} /></label>
        </div>
        <div className="builder__row">
          <label className="field">Group<input list="category-groups" value={form.grp} onChange={(e) => set({ grp: e.target.value })} /><datalist id="category-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist></label>
          <label className="field">Tier
            <select value={form.tier} onChange={(e) => set({ tier: e.target.value })}>{["A", "B", "C", "D"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </label>
          <label className="field">Icon name<input value={form.icon} onChange={(e) => set({ icon: e.target.value })} /></label>
          <label className="field">Order<input inputMode="numeric" value={form.sort} onChange={(e) => set({ sort: e.target.value.replace(/[^\d]/g, "") })} /></label>
        </div>
        <label><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Available to new applicants</label>
        {turningOff && (
          <label className="field">Why is it being switched off?<textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
        )}
        {!form.isNew && <p className="muted">Changing questions affects new applications only. Answers sellers already gave are kept.</p>}
        <QuestionsEditor fields={form.template} onChange={(template) => set({ template })} problems={fieldProblems} />
        <DocsEditor docs={form.extra_docs} onChange={(extra_docs) => set({ extra_docs })} problems={documentProblems} />
        {message ? <p className="modal__error" role="alert">{message}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready || save.isPending}>{save.isPending ? "Saving" : "Save category"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const { can, why } = usePermissions();
  const [editing, setEditing] = useState(null);
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-categories"], queryFn: () => api.listCategories() });
  const canEdit = can("catalogue.edit");
  const groups = [...new Set(data.map((c) => c.grp))];

  return (
    <div className="page-shell">
      <section className="panel">
        <div className="panel__header">
          <h2 className="heading-sm">Categories</h2>
          <Button variant="primary" disabled={!canEdit} title={why("catalogue.edit")} onClick={() => setEditing(blank)}>New category</Button>
        </div>
        <p className="muted">Categories are switched off, never deleted: sellers already in one keep it. A new category stays off until both its plans have a price.</p>
        {isError ? <LoadError what="categories" error={error} onRetry={refetch} /> : (
          <div className="table-shell">
            <table>
              <thead><tr><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Sellers</th><th scope="col">Plans</th><th scope="col">Questions</th><th scope="col">Documents</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {isLoading ? <tr><td colSpan={7}><span className="skeleton" /></td></tr> : data.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><div className="muted">{c.grp} · tier {c.tier}</div></td>
                    <td><span className={`status-pill ${c.active ? "status-pill--live" : "status-pill--neutral"}`}>{c.active ? "On" : "Off"}</span></td>
                    <td>{c.live_businesses} live{c.businesses > c.live_businesses ? ` (${c.businesses} total)` : ""}</td>
                    <td>{c.priced_plans === 2 ? `From KES ${Number(c.min_price).toLocaleString("en-KE")}` : <span className="text-danger">Not priced</span>}</td>
                    <td>{c.template.length}</td>
                    <td>{c.extra_docs.length}</td>
                    <td><Button size="sm" disabled={!canEdit} title={why("catalogue.edit")} onClick={() => setEditing({ ...c, isNew: false })} aria-label={`Edit ${c.name}`}>Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <CategoryDialog initial={editing} groups={groups} onClose={() => setEditing(null)} />}
    </div>
  );
}
