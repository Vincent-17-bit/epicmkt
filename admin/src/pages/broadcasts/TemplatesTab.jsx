import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import LoadError from "../../components/LoadError.jsx";
import Modal from "../../components/Modal.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { smsInfo, templateVariables } from "../../lib/messaging.js";

const empty = { key: "", channel: "sms", subject: "", bodyEn: "", bodySw: "", transactional: false, isNew: true };

function TemplateDialog({ initial, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = useMutation({
    mutationFn: () => api.saveTemplate({ key: form.key.trim(), channel: form.channel, subject: form.subject, bodyEn: form.bodyEn, bodySw: form.bodySw, transactional: form.transactional }),
    onSuccess: (version) => {
      toast.push({ message: `Saved as version ${version}.` });
      queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      onClose();
    },
  });
  const sms = smsInfo(form.bodyEn);
  const vars = templateVariables(form.bodyEn, form.bodySw, form.subject);
  const ready = form.key.trim().length >= 2 && form.bodyEn.trim() && !save.isPending && !(form.channel === "sms" && sms.over) && !(form.channel === "email" && !form.subject.trim());
  return (
    <Modal title={form.isNew ? "New template" : `Edit ${form.key}`} onClose={save.isPending ? () => {} : onClose}>
      <form className="modal__form" onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate(); }}>
        <label className="field">Key<input value={form.key} disabled={!form.isNew} placeholder="renewal_reminder" onChange={(e) => set({ key: e.target.value })} /></label>
        <label className="field">Channel
          <select value={form.channel} disabled={!form.isNew} onChange={(e) => set({ channel: e.target.value })}><option value="sms">SMS</option><option value="email">Email</option><option value="in_app">In-app</option></select>
        </label>
        {form.channel !== "sms" && <label className="field">Subject<input value={form.subject} maxLength={150} onChange={(e) => set({ subject: e.target.value })} /></label>}
        <label className="field">English<textarea rows={4} value={form.bodyEn} onChange={(e) => set({ bodyEn: e.target.value })} /></label>
        {form.channel === "sms" && <p className={sms.over ? "text-danger" : "muted"}>{sms.length} characters, {sms.segments} SMS</p>}
        <label className="field">Kiswahili (optional)<textarea rows={3} value={form.bodySw} onChange={(e) => set({ bodySw: e.target.value })} /></label>
        <label><input type="checkbox" checked={form.transactional} onChange={(e) => set({ transactional: e.target.checked })} /> Billing or account notice (ignores quiet hours)</label>
        {vars.length > 0 && <p className="muted">Uses: {vars.map((v) => `{{${v}}}`).join(", ")}</p>}
        {save.isError ? <p className="modal__error" role="alert">{save.error.message}</p> : null}
        <div className="modal__footer">
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!ready}>{save.isPending ? "Saving" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function TemplatesTab() {
  const { can, why } = usePermissions();
  const [editing, setEditing] = useState(null);
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-templates"], queryFn: () => api.listTemplates() });
  const canEdit = can("catalogue.edit");

  if (isError) return <LoadError what="templates" error={error} onRetry={refetch} />;
  return (
    <div>
      <div className="toolbar">
        <p className="muted">Sellers receive these through reminders and broadcasts. Only the owner can change them; every change is versioned and audited.</p>
        <Button variant="primary" className="toolbar__bulk" disabled={!canEdit} title={why("catalogue.edit")} onClick={() => setEditing(empty)}>New template</Button>
      </div>
      <div className="table-shell">
        <table>
          <thead><tr><th scope="col">Key</th><th scope="col">Channel</th><th scope="col">Text</th><th scope="col">Used (30 days)</th><th scope="col">Version</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6}><span className="skeleton" /></td></tr>
              : data.length === 0 ? <tr><td colSpan={6}>No templates yet.</td></tr>
              : data.map((t) => (
                <tr key={t.key}>
                  <td><strong>{t.key}</strong>{t.transactional ? <div className="muted">Billing notice</div> : null}</td>
                  <td>{t.channel === "in_app" ? "In-app" : t.channel.toUpperCase()}</td>
                  <td>{t.subject ? <strong>{t.subject}<br /></strong> : null}{t.body_en}{t.body_sw ? <div className="muted">Kiswahili: {t.body_sw}</div> : null}</td>
                  <td>{t.used_30d}</td>
                  <td>v{t.version}</td>
                  <td><Button size="sm" disabled={!canEdit} title={why("catalogue.edit")} onClick={() => setEditing({ key: t.key, channel: t.channel, subject: t.subject ?? "", bodyEn: t.body_en, bodySw: t.body_sw ?? "", transactional: t.transactional, isNew: false })} aria-label={`Edit template ${t.key}`}>Edit</Button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {editing && <TemplateDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
