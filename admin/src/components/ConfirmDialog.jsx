import { useState } from "react";
import Button from "./Button.jsx";
import Modal from "./Modal.jsx";

const MIN_REASON = 5;
const noop = () => {};

export default function ConfirmDialog({
  title,
  summary,
  confirmLabel = "Confirm",
  danger = false,
  confirmWord,
  valid = true,
  busy = false,
  error,
  onConfirm,
  onCancel,
  children,
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const ready = valid && !busy && reason.trim().length >= MIN_REASON && (!confirmWord || typed.trim().toUpperCase() === confirmWord);

  const submit = (event) => {
    event.preventDefault();
    if (ready) onConfirm(reason.trim());
  };

  return (
    <Modal title={title} onClose={busy ? noop : onCancel}>
      <form className="modal__form" onSubmit={submit}>
        {summary ? <p className="modal__summary">{summary}</p> : null}
        {children}
        <label className="field">
          Reason (required)
          <textarea value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
        </label>
        {confirmWord ? (
          <label className="field">
            Type {confirmWord} to confirm
            <input value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
          </label>
        ) : null}
        {error ? <p className="modal__error" role="alert">{error}</p> : null}
        <div className="modal__footer">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" className={danger ? "admin-button--danger" : ""} disabled={!ready}>
            {busy ? "Working" : confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
