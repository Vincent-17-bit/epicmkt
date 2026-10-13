import { useState } from "react";
import { faPen, faTrashCan, faPlus } from "@fortawesome/free-solid-svg-icons";
import { normalizeExceptions, validateException, serializeException, dateKeyOf, parseDateKey, MAX_EXCEPTIONS, LABEL_MAX, dowOf, DAY_NAMES } from "@epicmkt/shared/hours";
import { Button, IconButton } from "../../components/ui/index.js";
import DayEditor from "./DayEditor.jsx";
import { showToast } from "../../stores/toast.js";
import { isConflict, messageForError, CONFLICT_TEXT } from "./errors.js";
import { daySummary, longDate } from "./format.js";
import styles from "./hours.module.css";

const blank = () => ({ date: "", closed: true, open24: false, intervals: [], note: "" });

export default function Exceptions({ data, now, actions }) {
  const today = dateKeyOf(now);
  const all = normalizeExceptions(data.exceptions);
  const upcoming = all.filter((e) => e.date >= today);
  const past = all.length - upcoming.length;
  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);

  const commit = async (list, message, previousList) => {
    setBusy(true);
    setError("");
    try {
      await actions.saveExceptions(list);
      setConflict(false);
      showToast(message, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await actions.saveExceptions(previousList);
              showToast("Change undone");
            } catch (e) {
              showToast(isConflict(e) ? "Could not undo: changed on another device." : messageForError(e), { tone: "error" });
            }
          }
        }
      });
      return true;
    } catch (e) {
      if (isConflict(e)) setConflict(true);
      else setError(messageForError(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const problems = form ? [...validateException(form), ...(form.date && form.date < today ? [{ code: "past", message: "Choose today or a later date." }] : [])] : [];
  const replaces = form && all.some((e) => e.date === form.date && e.date !== original);

  const submit = async () => {
    const entry = serializeException(form);
    const without = all.filter((e) => e.date !== form.date && e.date !== original);
    if (without.length >= MAX_EXCEPTIONS) {
      setError(`You can keep up to ${MAX_EXCEPTIONS} date exceptions.`);
      return;
    }
    const ok = await commit(normalizeExceptions([...without, entry]), `Saved hours for ${longDate(form.date)}`, all);
    if (ok) {
      setForm(null);
      setOriginal(null);
    }
  };

  const remove = (e) => commit(all.filter((x) => x.date !== e.date), `Removed ${longDate(e.date)}`, all);
  const clearPast = () => commit(upcoming, `Cleared ${past} past ${past === 1 ? "date" : "dates"}`, all);

  return (
    <div className={styles.exceptions}>
      {conflict && (
        <div className={styles.alert} role="alert">
          <p>{CONFLICT_TEXT}</p>
          <Button
            size="sm"
            onClick={async () => {
              await actions.reload();
              setConflict(false);
            }}
          >
            Reload
          </Button>
        </div>
      )}

      {upcoming.length === 0 && !form && <p className={styles.hint}>No special dates yet. Add holidays or one-off hours that replace your weekly hours for a single day.</p>}

      <ul className={styles.exList}>
        {upcoming.map((e) => (
          <li key={e.date} className={styles.exItem}>
            <div className={styles.exText}>
              <p className={styles.exDate}>
                {longDate(e.date)}
                {e.date === today && <span className={styles.todayChip}>Today</span>}
              </p>
              <p className={styles.exSummary}>{daySummary(e)}</p>
              {e.note && <p className={styles.hint}>{e.note}</p>}
            </div>
            <div className={styles.exButtons}>
              <IconButton
                icon={faPen}
                label={`Edit ${longDate(e.date)}`}
                onClick={() => {
                  setForm({ ...e, note: e.note ?? "" });
                  setOriginal(e.date);
                  setError("");
                }}
                disabled={busy}
              />
              <IconButton icon={faTrashCan} label={`Remove ${longDate(e.date)}`} onClick={() => remove(e)} disabled={busy} />
            </div>
          </li>
        ))}
      </ul>

      {past > 0 && !form && (
        <Button variant="ghost" size="sm" onClick={clearPast} disabled={busy}>
          Clear {past} past {past === 1 ? "date" : "dates"}
        </Button>
      )}

      {!form && (
        <div className={styles.actionRow}>
          <Button
            icon={faPlus}
            onClick={() => {
              setForm(blank());
              setOriginal(null);
              setError("");
            }}
          >
            Add date exception
          </Button>
        </div>
      )}

      {form && (
        <div className={styles.exForm}>
          <h3 className={styles.legend}>{original ? "Edit date exception" : "New date exception"}</h3>
          <div className={styles.fieldset}>
            <label htmlFor="ex-date" className={styles.legend}>
              Date
            </label>
            <input id="ex-date" type="date" className={styles.textInput} min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-autofocus />
            {form.date && !Number.isNaN(parseDateKey(form.date)) && (
              <p className={styles.hint}>
                Replaces your regular {DAY_NAMES[dowOf(parseDateKey(form.date))]} hours{replaces ? " and the exception already on this date" : ""}.
              </p>
            )}
          </div>
          <DayEditor day={form} onChange={(d) => setForm({ ...form, ...d })} idPrefix="ex" closedLabel="Closed all day" compact />
          <div className={styles.fieldset}>
            <label htmlFor="ex-note" className={styles.legend}>
              Note <span className={styles.optional}>(optional)</span>
            </label>
            <input id="ex-note" className={styles.textInput} maxLength={LABEL_MAX} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="For example: Public holiday" />
          </div>
          {problems.filter((p) => (p.code === "date" && form.date) || p.code === "past").map((p) => (
            <p key={p.code} className={styles.error} role="alert">
              {p.message}
            </p>
          ))}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actionRow}>
            <Button
              onClick={() => {
                setForm(null);
                setOriginal(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} busy={busy} disabled={problems.length > 0}>
              Save exception
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
