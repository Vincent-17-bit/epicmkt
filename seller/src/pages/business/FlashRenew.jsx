import { useState } from "react";
import { FLASH_MAX_DAYS, FLASH_MAX_MS, FLASH_QUICK, extendChoices, flashPrice, formatKes, renewInput, spanText, validateFlashSale, zoneLabel } from "@epicmkt/shared";
import * as api from "../../api/index.js";
import { serverNow } from "../../lib/clock.js";
import { errorText } from "../../lib/errors.js";
import ui from "../../styles/ui.module.css";
import styles from "./flash.module.css";
import { fromLocalInput, stamp, toLocalInput } from "./flashTime.js";

const describe = (sale) =>
  sale.discountType === "percent" ? `${sale.discountValue}% off` : sale.discountType === "amount_off" ? `${formatKes(sale.discountValue)} off` : `Sale price ${formatKes(sale.discountValue)}`;

// Run an ended sale again: same item, discount, per-option prices, headline and note, for as long as the seller wants (up to 14 days).
// It is a new sale (so it counts toward the plan's limits like any other) and every rule is checked first by the same code the
// database uses, so a bad end time is explained here instead of failing after the round trip.
export function RenewPanel({ sale, quota, onDone, onCancel }) {
  const opened = serverNow();
  const planned = Date.parse(sale.endsAt) - Date.parse(sale.startsAt);
  // Offer the length the sale had before, as a starting point the seller can change in one tap.
  const first = Math.min(FLASH_MAX_MS, Math.max(3_600_000, Math.round(planned / 60_000) * 60_000));
  const [schedule, setSchedule] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState(toLocalInput(opened + first));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const startIso = schedule && start ? fromLocalInput(start) : null;
  const startMs = Math.max(startIso ? Date.parse(startIso) : opened, opened);
  const endIso = end ? fromLocalInput(end) : "";
  const check = endIso ? validateFlashSale({ ...renewInput(sale, { endsAt: endIso, startsAt: startIso }), itemPrice: sale.regularPrice }, serverNow()) : { ok: false, error: "invalid_window" };
  const span = endIso ? Date.parse(endIso) - startMs : null;
  const price = sale.regularPrice ? flashPrice(sale.discountType, sale.discountValue, sale.regularPrice) : null;
  const blocked = quota && !quota.canCreate;

  const quick = (ms) => {
    setError("");
    setEnd(toLocalInput(startMs + ms));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!check.ok) return setError(errorText({ code: check.error }));
    setBusy(true);
    try {
      await api.createFlashSale({ ...renewInput(sale, { endsAt: check.value.endsAt, startsAt: startIso }), ...check.value });
      await onDone();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className={styles.renewPanel} onSubmit={submit} noValidate aria-label={`Renew ${sale.itemName} flash sale`} data-testid="renew-panel">
      <div>
        <h3 className={styles.renewTitle}>Run this sale again</h3>
        <p className={styles.note}>
          {sale.itemName}: {describe(sale)}
          {price !== null && ` (customers pay ${formatKes(price)} instead of ${formatKes(sale.regularPrice)} at today's price)`}
        </p>
        {sale.variantTarget === "chosen" && sale.variantOverrides?.length > 0 && <p className={styles.note}>The same {sale.variantOverrides.length === 1 ? "option" : "options"} are on sale as before.</p>}
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Starts</legend>
        <div className={styles.radios}>
          <label className={styles.radio}><input type="radio" name={`rn-when-${sale.id}`} checked={!schedule} onChange={() => setSchedule(false)} />Now</label>
          <label className={styles.radio}><input type="radio" name={`rn-when-${sale.id}`} checked={schedule} onChange={() => setSchedule(true)} />Schedule</label>
        </div>
        {schedule && (
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`rn-start-${sale.id}`}>{`Starts (your time, ${zoneLabel(opened)})`}</label>
            <input id={`rn-start-${sale.id}`} className={ui.input} type="datetime-local" value={start} min={toLocalInput(opened)} onChange={(e) => setStart(e.target.value)} />
          </div>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>How long should it run?</legend>
        <div className={styles.quick} role="group" aria-label="Quick durations">
          {FLASH_QUICK.map((q) => {
            const on = end && Math.abs(Date.parse(endIso) - startMs - q.ms) < 60_000;
            return <button key={q.key} type="button" className={`${ui.btn} ${on ? "" : ui.btnGhost}`} aria-pressed={Boolean(on)} onClick={() => quick(q.ms)}>{q.label}</button>;
          })}
        </div>
        <div className={ui.field}>
          <label className={ui.label} htmlFor={`rn-end-${sale.id}`}>{`Or pick the exact end (your time, ${zoneLabel(opened)})`}</label>
          <input id={`rn-end-${sale.id}`} className={ui.input} type="datetime-local" value={end} min={toLocalInput(startMs)} max={toLocalInput(startMs + FLASH_MAX_MS)} onChange={(e) => { setError(""); setEnd(e.target.value); }} />
        </div>
        <p className={check.ok ? styles.preview : styles.note} data-testid="renew-summary" aria-live="polite">
          {check.ok ? `Runs until ${stamp(check.value.endsAt)}, ${spanText(span)} in all.` : endIso ? `${errorText({ code: check.error })}` : `Choose how long it runs, up to ${FLASH_MAX_DAYS} days.`}
        </p>
      </fieldset>

      {blocked && <p className={ui.error} role="status">Your plan limit is reached, so a new sale cannot start. You can renew when another ends or next month.</p>}
      {!blocked && quota && <p className={styles.note}>A renewed sale counts as a new sale this month ({quota.monthlyUsed} of {quota.monthlyLimit ?? "unlimited"} used).</p>}
      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={ui.btn} disabled={busy || blocked}>{busy ? "Renewing" : schedule ? "Schedule renewal" : "Renew sale"}</button>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// Run a live or scheduled sale for longer: add a set amount, go to the limit, or pick an exact end. A sale can run for 14 days from
// its start, so the choices that would pass that are not offered.
export function ExtendPanel({ sale, phase, now, busy, onExtend, onCancel }) {
  const { choices, cap } = extendChoices(sale, now);
  const end = Date.parse(sale.endsAt);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");

  const setExact = () => {
    setError("");
    const iso = custom ? fromLocalInput(custom) : "";
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || ms <= end) return setError(errorText({ code: "invalid_window" }));
    if (ms > cap) return setError(errorText({ code: "duration_too_long" }));
    onExtend(new Date(ms).toISOString());
  };

  return (
    <div className={styles.confirm} role="group" aria-label={`Extend ${sale.itemName} flash sale`}>
      <p>
        Add time to this sale. It currently {phase === "scheduled" ? "runs until" : "ends"} {stamp(sale.endsAt)}.{" "}
        {cap > end ? `A sale can run for ${FLASH_MAX_DAYS} days from its start, so this one can go on until ${stamp(new Date(cap).toISOString())}.` : `It has reached the ${FLASH_MAX_DAYS} day limit. When it ends you can renew it.`}
      </p>
      {choices.length > 0 && (
        <div className={styles.actions}>
          {choices.map((c) => (
            <button key={c.key} type="button" className={ui.btn} disabled={busy} onClick={() => onExtend(c.endsAt)}>{c.max ? c.label : `Add ${c.label}`}</button>
          ))}
        </div>
      )}
      {cap > end && (
        <div className={styles.exactEnd}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor={`ex-end-${sale.id}`}>{`Or pick the exact end (your time, ${zoneLabel(end)})`}</label>
            <input id={`ex-end-${sale.id}`} className={ui.input} type="datetime-local" value={custom} min={toLocalInput(end + 60_000)} max={toLocalInput(cap)} onChange={(e) => setCustom(e.target.value)} />
          </div>
          <button type="button" className={ui.btn} disabled={busy || !custom} onClick={setExact}>Set end time</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
