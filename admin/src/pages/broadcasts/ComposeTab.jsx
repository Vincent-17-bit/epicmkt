import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { BROADCAST_ERRORS, SEGMENTS, buildBroadcast, missingVariables, samePayload, smsInfo, templateVariables } from "../../lib/messaging.js";

const blank = { segment: "expiring_7d", segmentValue: "", sms: true, email: false, inApp: false, templateKey: "", lang: "en", subject: "", body: "", variables: {}, transactional: false, scheduledAt: "" };
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`).replace(/[^A-Za-z0-9-]/g, "").slice(0, 60).padEnd(8, "0");
const explain = (failure) => BROADCAST_ERRORS[failure?.code] ?? failure?.message ?? "Something went wrong. Try again.";

export default function ComposeTab() {
  const { can, why } = usePermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState(null); // { payload, result }
  const [confirming, setConfirming] = useState(false);
  const [formError, setFormError] = useState("");
  const sendKey = useRef(newKey());
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setFormError(""); };

  const { data: templates = [] } = useQuery({ queryKey: ["admin-templates"], queryFn: () => api.listTemplates() });
  const template = templates.find((t) => t.key === form.templateKey);
  const body = template ? ((form.lang === "sw" && template.body_sw) || template.body_en) : form.body;
  const vars = useMemo(() => templateVariables(body, template?.subject ?? form.subject), [body, template, form.subject]);
  const needed = vars.filter((v) => !["business_name", "seller_id", "paid_until"].includes(v));
  const gaps = missingVariables(vars, form.variables);
  const sms = smsInfo(body);

  const current = buildBroadcast(form, { preview: true });
  const allowed = can("messages.send");
  const previewIsCurrent = preview && current.payload && samePayload(preview.payload, current.payload);

  const check = useMutation({
    mutationFn: (payload) => api.sendBroadcast(payload),
    onSuccess: (result, payload) => setPreview({ payload, result }),
    onError: (failure) => { setPreview(null); setFormError(explain(failure)); },
  });
  const send = useMutation({
    mutationFn: (payload) => api.sendBroadcast(payload),
    onSuccess: (result) => {
      setConfirming(false);
      toast.push({ message: result.duplicate ? "That message was already queued." : `${result.queued} ${result.queued === 1 ? "message" : "messages"} queued. They go out within a minute, outside quiet hours.` });
      setForm(blank);
      setPreview(null);
      sendKey.current = newKey();
      queryClient.invalidateQueries({ queryKey: ["admin-message-log"] });
    },
  });

  const onPreview = () => {
    if (current.error) { setFormError(current.error); return; }
    if (gaps.length) { setFormError(`Fill in: ${gaps.join(", ")}.`); return; }
    check.mutate(current.payload);
  };

  const result = previewIsCurrent ? preview.result : null;
  return (
    <div className="compose">
      <div className="compose__form">
        <label className="field">Send to
          <select value={form.segment} onChange={(e) => set({ segment: e.target.value, segmentValue: "" })}>
            {SEGMENTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        {(form.segment === "category" || form.segment === "town") && (
          <label className="field">{form.segment === "category" ? "Category id (for example barber)" : "Town"}
            <input value={form.segmentValue} onChange={(e) => set({ segmentValue: e.target.value })} />
          </label>
        )}

        <fieldset className="field-group"><legend>Channels</legend>
          <label><input type="checkbox" checked={form.sms} onChange={(e) => set({ sms: e.target.checked })} /> SMS</label>
          <label><input type="checkbox" checked={form.email} onChange={(e) => set({ email: e.target.checked })} /> Email</label>
          <label><input type="checkbox" checked={form.inApp} onChange={(e) => set({ inApp: e.target.checked })} /> In-app</label>
        </fieldset>

        <label className="field">Template
          <select value={form.templateKey} onChange={(e) => { const t = templates.find((x) => x.key === e.target.value); set({ templateKey: e.target.value, ...(t ? { transactional: t.transactional } : {}) }); }}>
            <option value="">Write my own message</option>
            {templates.map((t) => <option key={t.key} value={t.key}>{t.key} ({t.channel})</option>)}
          </select>
        </label>
        {template?.body_sw ? (
          <label className="field">Language
            <select value={form.lang} onChange={(e) => set({ lang: e.target.value })}><option value="en">English</option><option value="sw">Kiswahili</option></select>
          </label>
        ) : null}

        {template ? (
          <div className="compose__template"><strong>{template.subject ?? "No subject"}</strong><p>{body}</p></div>
        ) : (
          <>
            {form.email && <label className="field">Subject<input value={form.subject} maxLength={150} onChange={(e) => set({ subject: e.target.value })} /></label>}
            <label className="field">Message
              <textarea rows={5} value={form.body} maxLength={4000} onChange={(e) => set({ body: e.target.value })} />
            </label>
          </>
        )}
        {form.sms && body ? <p className={sms.over ? "text-danger" : "muted"}>{sms.length} characters, {sms.segments} SMS{sms.over ? ". Too long: keep it to 612." : ""}</p> : null}

        {needed.map((name) => (
          <label className="field" key={name}>Value for {`{{${name}}}`}
            <input value={form.variables[name] ?? ""} onChange={(e) => set({ variables: { ...form.variables, [name]: e.target.value } })} />
          </label>
        ))}
        <p className="muted">{`{{business_name}}`}, {`{{seller_id}}`} and {`{{paid_until}}`} are filled in for each seller.</p>

        <label className="field">Send at (optional)
          <input type="datetime-local" value={form.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} />
        </label>
        <label><input type="checkbox" checked={form.transactional} onChange={(e) => set({ transactional: e.target.checked })} /> This is a billing or account notice (sends even in quiet hours)</label>

        {formError ? <p className="modal__error" role="alert">{formError}</p> : null}
        <div className="compose__actions">
          <Button onClick={onPreview} disabled={!allowed || check.isPending} title={why("messages.send")}>{check.isPending ? "Checking" : "Preview"}</Button>
          <Button variant="primary" disabled={!allowed || !previewIsCurrent} title={allowed ? (previewIsCurrent ? "" : "Preview the message first") : why("messages.send")} onClick={() => { send.reset(); setConfirming(true); }}>Send broadcast</Button>
        </div>
      </div>

      <aside className="compose__preview" aria-live="polite">
        <h4>Preview</h4>
        {!result ? <p className="muted">Preview shows who will get this and exactly what they will read.</p> : (
          <>
            <p><strong>{result.recipients}</strong> {result.recipients === 1 ? "business" : "businesses"}: {result.rows.sms} SMS, {result.rows.email} email, {result.rows.inApp} in-app.</p>
            {result.skipped.sms + result.skipped.email > 0 && <p className="muted">Skipped for missing contact details: {result.skipped.sms} SMS, {result.skipped.email} email.</p>}
            <p className="muted">{result.transactional ? "Goes out straight away." : "Promotional: held back during quiet hours."}</p>
            {result.samples.map((s, i) => <blockquote key={i}><strong>{s.channel}{s.subject ? ` · ${s.subject}` : ""}</strong><br />{s.body}</blockquote>)}
          </>
        )}
      </aside>

      {confirming && result && (
        <ConfirmDialog
          title="Send this message"
          summary={`${result.rows.sms + result.rows.email + result.rows.inApp} messages to ${result.recipients} businesses. This cannot be recalled once it is sent.`}
          confirmLabel="Send broadcast"
          busy={send.isPending}
          error={send.isError ? explain(send.error) : ""}
          onConfirm={() => send.mutate({ ...preview.payload, preview: false, idempotencyKey: sendKey.current })}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
