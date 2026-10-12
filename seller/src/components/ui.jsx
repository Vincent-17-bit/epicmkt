import { useEffect, useId, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { moderation } from "@epicmkt/shared";
import { useToasts } from "./toast.js";
import { SITE_URL } from "../lib/workspace.js";
import styles from "./ui.module.css";

const cx = (...a) => a.filter(Boolean).join(" ");

export function Button({ as: Tag = "button", variant, size, icon, children, className, ...rest }) {
  const props = Tag === "button" ? { type: "button", ...rest } : rest;
  return (
    <Tag className={cx(styles.btn, variant && styles[variant], size && styles[size], className)} {...props}>
      {icon && <FontAwesomeIcon icon={icon} aria-hidden="true" />}
      {children !== undefined && <span>{children}</span>}
    </Tag>
  );
}

export function Chip({ tone, children, ...rest }) {
  const toneClass = tone === "primary" ? styles.chipPrimary : tone === "solid" ? styles.chipSolid : tone === "danger" ? styles.chipDanger : null;
  return <span className={cx(styles.chip, toneClass)} {...rest}>{children}</span>;
}

export function Meter({ label, used, limit, note }) {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className={cx(styles.meter, !unlimited && used >= limit && styles.full)}>
      <div className={styles.meterHead}>
        <span>{label}</span>
        <span className={styles.meterValue}>{unlimited ? `${used} · Unlimited` : `${used} of ${limit}`}</span>
      </div>
      {!unlimited && (
        <div className={styles.track} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>
      )}
      {note && <p className={styles.hint}>{note}</p>}
    </div>
  );
}

export function Field({ label, error, hint, children }) {
  const id = useId();
  const child = typeof children === "function" ? children({ id, "aria-invalid": error ? "true" : undefined, "aria-describedby": error ? `${id}-e` : hint ? `${id}-h` : undefined }) : children;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      {child}
      {hint && !error && <p id={`${id}-h`} className={styles.hint}>{hint}</p>}
      {error && <p id={`${id}-e`} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

export const inputClass = styles.input;

export function Dialog({ open, title, onClose, children, footer }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <div className={styles.dialogBody}>
          <div className={styles.dialogHead}>
            <h2 id={titleId} className={styles.dialogTitle}>{title}</h2>
            <Button variant="ghost" size="sm" icon={faXmark} onClick={onClose} aria-label="Close" />
          </div>
          {children}
          {footer && <div className={styles.dialogFoot}>{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function Notice({ title, children }) {
  return (
    <div className={styles.notice} role="status">
      {title && <p className={styles.noticeTitle}>{title}</p>}
      <p>{children}</p>
    </div>
  );
}

export function UpgradePrompt({ children }) {
  return (
    <div className={styles.upgrade}>
      <p>{children}</p>
      <Button as="a" href={`${SITE_URL}/sell`} size="sm">See Premium</Button>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

const STATUS_LABEL = { paused: "unlisted", suspended: "suspended", expired: "expired", pending: "not live yet" };

export function ReadOnlyBanner({ status }) {
  return (
    <Notice title="Read-only">
      {`Your listing is ${STATUS_LABEL[status] ?? "not live"}, so you can look at everything here but not change it.`}
    </Notice>
  );
}

export function ModerationNote({ row }) {
  const m = moderation(row);
  if (m.state === "ok") return null;
  return (
    <p>
      <Chip tone="danger">{m.state === "removed" ? "Removed by admin" : "Hidden by admin"}</Chip>
      {m.reason && <span> Reason: {m.reason}</span>}
    </p>
  );
}

export function ToastHost() {
  const items = useToasts((s) => s.items);
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={styles.toast}>
          <span>{t.message}</span>
          {t.actionLabel && <button type="button" className={styles.toastAction} onClick={t.onAction}>{t.actionLabel}</button>}
        </div>
      ))}
    </div>
  );
}
