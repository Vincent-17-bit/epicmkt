import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/errors.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// Message one seller by in-app notice, SMS and/or email. `business` supplies what is available (an email address or not).
export default function MessageDialog({ business, onSubmit, onClose }) {
  const ref = useRef(null);
  const [form, setForm] = useState({ subject: "", body: "", in_app: true, sms: false, email: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useFocusTrap(ref, true);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const channels = ["in_app", "sms", "email"].filter((c) => form[c]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.body.trim()) return setError("Write the message.");
    if (!channels.length) return setError("Choose at least one channel.");
    if ((form.in_app || form.email) && !form.subject.trim()) return setError("Add a subject for in-app and email messages.");
    if (form.email && !business.email) return setError("This business has no email address on file.");
    if (form.sms && form.body.trim().length > 480) return setError("An SMS can be at most 480 characters.");
    setBusy(true);
    setError("");
    try {
      await onSubmit({ subject: form.subject.trim(), body: form.body.trim(), channels });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="dialog" role="presentation">
      <div className="dialog__scrim" onClick={() => !busy && onClose()} />
      <form className="dialog__panel" role="dialog" aria-modal="true" aria-label={`Message ${business.name}`} ref={ref} onSubmit={submit} noValidate>
        <h2 className="dialog__title">Message · {business.name}</h2>
        <fieldset className="field field--row"><legend>Send by</legend>
          <label className="check"><input type="checkbox" checked={form.in_app} onChange={set("in_app")} /> In-app</label>
          <label className="check"><input type="checkbox" checked={form.sms} onChange={set("sms")} /> SMS to {business.phone}</label>
          <label className="check"><input type="checkbox" checked={form.email} onChange={set("email")} disabled={!business.email} /> Email{business.email ? "" : " (none on file)"}</label>
        </fieldset>
        <label className="field"><span>Subject (in-app and email)</span><input value={form.subject} onChange={set("subject")} maxLength={150} /></label>
        <label className="field"><span>Message</span><textarea rows={5} maxLength={form.sms ? 480 : 1000} value={form.body} onChange={set("body")} /></label>
        <div aria-live="polite">{error ? <p className="form-error" role="alert">{error}</p> : null}</div>
        <div className="dialog__actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="primary-button" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
        </div>
      </form>
    </div>
  );
}
