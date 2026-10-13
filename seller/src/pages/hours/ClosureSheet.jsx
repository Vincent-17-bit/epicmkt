import { useEffect, useMemo, useState } from "react";
import {
  computeStatus, validateOverride, tomorrowOpening, customUntil, floorToMinute, formatWhen, validateClosureMessage, REASON_LABELS,
  MESSAGE_MAX, MS_MIN, MS_HOUR, MAX_OVERRIDE_MS
} from "@epicmkt/shared/hours";
import { ClosureBanner, BottomSheet, Button, Chip, TimeField } from "../../components/ui/index.js";
import { useNow } from "../../hooks/useNow.js";
import { messageForError } from "./errors.js";
import styles from "./hours.module.css";

const PRESETS = [
  { key: "30m", label: "30 min", ms: 30 * MS_MIN },
  { key: "1h", label: "1 hour", ms: MS_HOUR },
  { key: "2h", label: "2 hours", ms: 2 * MS_HOUR },
  { key: "4h", label: "4 hours", ms: 4 * MS_HOUR }
];

export default function ClosureSheet({ open, onClose, type, business, defaults, actions, onDone }) {
  const now = useNow(15000);
  const isOpenType = type === "open";
  const [choice, setChoice] = useState("1h");
  const [custom, setCustom] = useState("");
  const [reason, setReason] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    if (!open) return;
    setChoice("1h");
    setCustom("");
    setReason(isOpenType ? null : defaults.defaultReason);
    setMessage("");
    setBusy(false);
    setServerError("");
  }, [open, isOpenType, defaults.defaultReason]);

  const tomorrow = useMemo(() => (isOpenType ? null : tomorrowOpening(business, now)), [business, now, isOpenType]);

  const untilFor = (at) => {
    if (choice === "tomorrow") return tomorrow != null && tomorrow > at ? tomorrow : null;
    if (choice === "custom") return customUntil(custom, at);
    const p = PRESETS.find((x) => x.key === choice);
    return p ? floorToMinute(at + p.ms) : null;
  };

  const until = untilFor(now);
  const msg = validateClosureMessage(message);
  const candidate = until == null ? null : { type, since: new Date(now).toISOString(), until: new Date(until).toISOString(), reason: isOpenType ? null : reason, message: msg.ok ? msg.text : "" };
  const check = candidate ? validateOverride(candidate, now) : { ok: false, code: "until", message: choice === "custom" ? "Choose a time within the next 24 hours." : "" };
  const status = useMemo(() => (candidate && check.ok ? computeStatus({ ...business, override: candidate }, now) : null), [candidate?.until, candidate?.reason, candidate?.message, check.ok, business, now]);
  const count = [...message].length;
  const canConfirm = check.ok && msg.ok && !busy;

  const confirm = async () => {
    const at = Date.now();
    const finalUntil = untilFor(at);
    const result = validateOverride({ type, since: new Date(at).toISOString(), until: finalUntil == null ? null : new Date(finalUntil).toISOString(), reason: isOpenType ? null : reason, message }, at);
    if (!result.ok) {
      setServerError(result.message || "Check the time and try again.");
      return;
    }
    setBusy(true);
    setServerError("");
    try {
      const previous = business.override;
      const saved = await actions.setOverride(result.value);
      onDone({ type, saved, previous });
    } catch (e) {
      setBusy(false);
      setServerError(messageForError(e));
    }
  };

  const heading = isOpenType ? "Open late" : "Close temporarily";
  const verb = isOpenType ? "Open until" : "Closed until";
  const confirmText = until != null && check.ok ? `${isOpenType ? "Stay open until" : "Close until"} ${formatWhen(until, now)}` : isOpenType ? "Open late" : "Close temporarily";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={heading}
      description={isOpenType ? "Stay open past your normal hours. You can end it early at any time." : "Customers will see you as closed. You can reopen early at any time."}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} busy={busy} disabled={!canConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div className={styles.sheetStack}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{isOpenType ? "Open until" : "Close for"}</legend>
          <div className={styles.chipRow}>
            {PRESETS.map((p) => (
              <Chip key={p.key} selected={choice === p.key} onClick={() => setChoice(p.key)} data-autofocus={p.key === "1h" ? "" : undefined}>
                {p.label}
              </Chip>
            ))}
            {tomorrow != null && (
              <Chip selected={choice === "tomorrow"} onClick={() => setChoice("tomorrow")}>
                Until tomorrow’s opening
              </Chip>
            )}
            <Chip selected={choice === "custom"} onClick={() => setChoice("custom")}>
              Custom
            </Chip>
          </div>
          {choice === "custom" && (
            <div className={styles.customRow}>
              <TimeField label={isOpenType ? "Open until" : "Closed until"} value={custom} onChange={setCustom} invalid={custom !== "" && until == null} />
              <p className={styles.hint}>Within the next 24 hours.</p>
            </div>
          )}
          {until != null && (
            <p className={styles.resultLine} data-testid="until-line">
              {verb} {formatWhen(until, now)}
            </p>
          )}
          <p className={styles.hint}>A temporary closure can last up to {MAX_OVERRIDE_MS / MS_HOUR} hours in total.</p>
        </fieldset>

        {!isOpenType && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Reason</legend>
            <div className={styles.chipRow}>
              {defaults.closureReasons.map((r) => (
                <Chip key={r} selected={reason === r} onClick={() => setReason(reason === r ? null : r)}>
                  {REASON_LABELS[r]}
                </Chip>
              ))}
            </div>
          </fieldset>
        )}

        <div className={styles.fieldset}>
          <label htmlFor="closure-message" className={styles.legend}>
            Message for customers <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id="closure-message"
            className={`${styles.textarea} ${msg.ok ? "" : styles.invalidField}`}
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={!msg.ok || undefined}
            aria-describedby="closure-message-help"
            placeholder={isOpenType ? "For example: Open a little later tonight" : "For example: Back after lunch"}
          />
          <div id="closure-message-help" className={styles.counterRow}>
            <span className={msg.ok ? styles.hint : styles.error} role={msg.ok ? undefined : "alert"}>
              {msg.ok ? "No links, emails or phone numbers." : msg.message}
            </span>
            <span className={count > MESSAGE_MAX ? styles.error : styles.hint} data-testid="message-counter">
              {count}/{MESSAGE_MAX}
            </span>
          </div>
        </div>

        <div className={styles.previewBox}>
          <p className={styles.legend}>What customers will see</p>
          {status ? <ClosureBanner status={status} /> : <p className={styles.hint}>Choose how long to see a preview.</p>}
        </div>

        {serverError && (
          <p className={styles.error} role="alert">
            {serverError}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
