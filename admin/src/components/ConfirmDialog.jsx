import { useEffect, useId, useState } from "react";
import { Modal } from "./Modal.jsx";
import { Button } from "./Button.jsx";
import styles from "./ConfirmDialog.module.css";

export const MIN_REASON_LENGTH = 5;

/**
 * Confirms a risky action. Two safeguards, each optional:
 *  - requireReason (default true): a written reason, at least `minReasonLength` characters. It is
 *    passed to onConfirm so it can go into the audit log.
 *  - confirmText: the person must type this exact text (for example the business name) before the
 *    button enables.
 * onConfirm({ reason }) may return a promise. While it runs the button shows loading and the dialog
 * cannot be dismissed; if it throws, the message is shown and the dialog stays open.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  requireReason = true,
  reasonLabel = "Reason",
  reasonHint = "This is saved in the audit log.",
  minReasonLength = MIN_REASON_LENGTH,
  confirmText,
  theme,
  children,
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonId = useId();
  const typedId = useId();
  const errorId = useId();

  useEffect(() => {
    if (open) {
      setReason("");
      setTyped("");
      setBusy(false);
      setError("");
    }
  }, [open]);

  const reasonOk = !requireReason || reason.trim().length >= minReasonLength;
  const typedOk = !confirmText || typed.trim() === confirmText;
  const ready = reasonOk && typedOk;

  const missing = [];
  if (!reasonOk) missing.push(`write a reason (at least ${minReasonLength} characters)`);
  if (!typedOk) missing.push(`type "${confirmText}" exactly`);

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm?.({ reason: reason.trim() });
      setBusy(false);
    } catch (e) {
      setBusy(false);
      setError(e?.message || "That did not work. Please try again.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={(why) => !busy && onClose?.(why)}
      dismissible={!busy}
      title={title}
      description={description}
      role="alertdialog"
      theme={theme}
      size="md"
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        {children}

        {requireReason ? (
          <div className={styles.field}>
            <label htmlFor={reasonId} className={styles.label}>{reasonLabel}</label>
            <textarea
              id={reasonId}
              className={styles.input}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              aria-describedby={`${reasonId}-hint`}
              data-autofocus=""
            />
            <p id={`${reasonId}-hint`} className={styles.hint}>{reasonHint}</p>
          </div>
        ) : null}

        {confirmText ? (
          <div className={styles.field}>
            <label htmlFor={typedId} className={styles.label}>
              Type <strong className={styles.phrase}>{confirmText}</strong> to confirm
            </label>
            <input
              id={typedId}
              className={styles.input}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              data-autofocus={requireReason ? undefined : ""}
            />
          </div>
        ) : null}

        <p className={styles.status} aria-live="polite">
          {!ready && missing.length ? `To continue, ${missing.join(" and ")}.` : ""}
        </p>
        {error ? <p id={errorId} className={styles.error} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => onClose?.("button")} disabled={busy}>{cancelLabel}</Button>
          <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} loading={busy} disabled={!ready && !busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
