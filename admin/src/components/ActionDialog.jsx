import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ACTIONS, REASON_MAX, validateAction } from "../lib/businesses.js";
import { errorMessage } from "../lib/errors.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";

// Confirms one action on one business, or on several (`count` > 1 and `businesses` set to the selection).
// It collects exactly what the RPC needs: a reason where required, the typed business name where dangerous, plus the
// action's own fields. `onSubmit(form)` returns a promise; a rejection is shown inside the dialog and nothing closes.
export default function ActionDialog({ actionKey, business, count = 1, onSubmit, onClose }) {
  const action = ACTIONS[actionKey];
  const ref = useRef(null);
  const titleId = useId();
  const [form, setForm] = useState({ reason: "", typed: "", days: "7", delta: "1", level: "verified", until: "", rank: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  useFocusTrap(ref, true);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  useEffect(() => ref.current?.querySelector("textarea, input, select, button")?.focus(), []);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // Typing the business name only makes sense for a single business; a bulk action types the count instead.
  const subject = count > 1 ? { name: String(count) } : business;
  const problem = useMemo(() => validateAction(actionKey, form, subject), [actionKey, form, subject]);

  if (!action) return null;

  const submit = async (event) => {
    event.preventDefault();
    setTouched(true);
    if (problem) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(form);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const target = count > 1 ? `${count} businesses` : business?.name;
  const typedLabel = count > 1 ? `Type ${count} to confirm` : `Type “${business?.name}” to confirm`;

  return (
    <div className="dialog" role="presentation">
      <div className="dialog__scrim" onClick={() => !busy && onClose()} />
      <form className="dialog__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} onSubmit={submit} noValidate>
        <h2 id={titleId} className="dialog__title">{action.label}{target ? ` · ${target}` : ""}</h2>
        <p className="dialog__help">{action.help}</p>

        {actionKey === "extend" ? (
          <label className="field"><span>Days to add (1 to 365)</span>
            <input type="number" min="1" max="365" step="1" inputMode="numeric" value={form.days} onChange={set("days")} />
          </label>
        ) : null}
        {actionKey === "verify" ? (
          <label className="field"><span>Verification</span>
            <select value={form.level} onChange={set("level")}>
              <option value="verified">Verified</option>
              <option value="unverified">Not verified</option>
            </select>
          </label>
        ) : null}
        {actionKey === "strikes" ? (
          <label className="field"><span>Change strikes by (−3 to 3)</span>
            <input type="number" min="-3" max="3" step="1" inputMode="numeric" value={form.delta} onChange={set("delta")} />
          </label>
        ) : null}
        {actionKey === "feature" ? (
          <>
            <label className="field"><span>Featured until (optional)</span>
              <input type="datetime-local" value={form.until} onChange={set("until")} />
            </label>
            <label className="field"><span>Rank (optional, 1 is first)</span>
              <input type="number" min="1" step="1" inputMode="numeric" value={form.rank} onChange={set("rank")} />
            </label>
          </>
        ) : null}

        {action.reason ? (
          <label className="field"><span>Reason (kept in the audit log)</span>
            <textarea rows={3} maxLength={REASON_MAX} value={form.reason} onChange={set("reason")} placeholder="What happened, in a sentence the next admin can understand" />
            <small className="field__count">{form.reason.trim().length}/{REASON_MAX}</small>
          </label>
        ) : null}

        {action.typed ? (
          <label className="field"><span>{typedLabel}</span>
            <input type="text" autoComplete="off" spellCheck={false} value={form.typed} onChange={set("typed")} />
          </label>
        ) : null}

        <div aria-live="polite">
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!error && touched && problem ? <p className="form-error" role="alert">{problem}</p> : null}
        </div>

        <div className="dialog__actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={action.danger ? "danger-button" : "primary-button"} disabled={busy || (touched && Boolean(problem))}>
            {busy ? "Working…" : action.label}
          </button>
        </div>
      </form>
    </div>
  );
}
