import { useEffect, useState } from "react";
import { extensionLimits, extendOverride, customUntil, formatWhen, fromMinutes, minutesOfDay, MS_MIN, MS_HOUR } from "@epicmkt/shared/hours";
import { BottomSheet, Button, Chip, TimeField } from "../../components/ui/index.js";
import { useNow } from "../../hooks/useNow.js";
import { allowance } from "./format.js";
import { messageForError } from "./errors.js";
import styles from "./hours.module.css";

const OPTIONS = [
  { key: "30m", label: "+30 min", ms: 30 * MS_MIN },
  { key: "1h", label: "+1 hour", ms: MS_HOUR }
];

export default function ExtendSheet({ open, onClose, override, actions, onDone }) {
  const now = useNow(15000);
  const [choice, setChoice] = useState("30m");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const until = override ? Date.parse(override.until) : now;

  useEffect(() => {
    if (!open) return;
    setChoice("30m");
    setCustom(override ? fromMinutes(minutesOfDay(Date.parse(override.until))) : "");
    setBusy(false);
    setError("");
  }, [open]);

  if (!override) return <BottomSheet open={false} onClose={onClose} title="Extend closure" />;

  const limits = extensionLimits(override, now);
  const addFor = (key) => {
    if (key === "custom") {
      const at = customUntil(custom, until);
      return at == null ? null : at - until;
    }
    return OPTIONS.find((o) => o.key === key)?.ms ?? null;
  };
  const fits = (ms) => ms != null && ms > 0 && ms <= limits.remainingMs;
  const add = addFor(choice);
  const next = add != null ? until + add : null;
  const valid = fits(add) && extendOverride(override, add, now).ok;
  const customAdd = addFor("custom");
  const customOver = choice === "custom" && customAdd != null && customAdd > limits.remainingMs;

  const confirm = async () => {
    const result = extendOverride(override, addFor(choice), Date.now());
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await actions.setOverride(result.value);
      onDone({ saved, previous: override });
    } catch (e) {
      setBusy(false);
      setError(messageForError(e));
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Extend closure"
      description={`Currently closed until ${formatWhen(until, now)}.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} busy={busy} disabled={!valid || busy}>
            {valid && next != null ? `Extend to ${formatWhen(next, now)}` : "Extend"}
          </Button>
        </>
      }
    >
      <div className={styles.sheetStack}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Add time</legend>
          <div className={styles.chipRow}>
            {OPTIONS.map((o) => (
              <Chip key={o.key} selected={choice === o.key} disabled={!fits(o.ms)} onClick={() => setChoice(o.key)} data-autofocus={o.key === "30m" ? "" : undefined}>
                {o.label}
              </Chip>
            ))}
            <Chip selected={choice === "custom"} disabled={!limits.canExtend} onClick={() => setChoice("custom")}>
              Custom
            </Chip>
          </div>
          {choice === "custom" && (
            <div className={styles.customRow}>
              <TimeField label="New end time" value={custom} onChange={setCustom} invalid={customOver} />
            </div>
          )}
          {next != null && valid && (
            <p className={styles.resultLine} data-testid="new-end">
              New end time: {formatWhen(next, now)}
            </p>
          )}
          {customOver && (
            <p className={styles.error} role="alert">
              That is past the 24 hour limit.
            </p>
          )}
          <p className={styles.hint} data-testid="allowance">
            {limits.canExtend ? `You can add up to ${allowance(limits.remainingMs)} more. A closure can last 24 hours in total.` : "You have reached the 24 hour limit. Reopen, then start a new closure if you need one."}
          </p>
        </fieldset>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
