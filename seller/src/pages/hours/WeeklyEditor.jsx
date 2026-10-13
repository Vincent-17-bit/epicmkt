import { useState } from "react";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { WEEK, DAY_NAMES, dowOf, validateDay } from "@epicmkt/shared/hours";
import { Button } from "../../components/ui/index.js";
import DayEditor from "./DayEditor.jsx";
import ConfirmSheet from "./ConfirmSheet.jsx";
import { CONFLICT_TEXT } from "./errors.js";
import { daySummary } from "./format.js";
import styles from "./hours.module.css";

export default function WeeklyEditor({ state, now }) {
  const { draft, dirty, conflict, saving, error, validation, setDay, reset, reload, save, copyToAll } = state;
  const [confirmCopy, setConfirmCopy] = useState(false);
  const today = dowOf(now);
  const mondayValid = validateDay(draft.mon).length === 0;

  return (
    <div className={styles.editor}>
      {conflict && (
        <div className={styles.alert} role="alert" data-testid="conflict">
          <p>{CONFLICT_TEXT}</p>
          <Button size="sm" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.editorTools}>
        <Button icon={faCopy} size="sm" onClick={() => setConfirmCopy(true)} disabled={!mondayValid || saving} title={mondayValid ? undefined : "Fix Monday’s hours first"}>
          Copy Monday to all
        </Button>
      </div>

      <ul className={styles.days}>
        {WEEK.map((key) => {
          const problems = validation.days[key];
          return (
            <li key={key} className={`${styles.dayCard} ${problems.length ? styles.dayInvalid : ""}`} data-day={key}>
              <div className={styles.dayHead}>
                <h3 className={styles.dayName}>{DAY_NAMES[key]}</h3>
                {key === today && <span className={styles.todayChip}>Today</span>}
              </div>
              <DayEditor day={draft[key]} onChange={(d) => setDay(key, d)} idPrefix={`day-${key}`} />
            </li>
          );
        })}
      </ul>

      {dirty && (
        <div className={styles.saveBar} role="region" aria-label="Unsaved changes">
          <span className={styles.saveText}>{validation.ok ? "You have unsaved changes" : "Fix the highlighted days to save"}</span>
          <div className={styles.saveButtons}>
            <Button onClick={reset} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} busy={saving} disabled={!validation.ok || conflict}>
              Save
            </Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={confirmCopy}
        onClose={() => setConfirmCopy(false)}
        title="Copy Monday to all days?"
        confirmLabel="Copy to all days"
        onConfirm={() => {
          copyToAll("mon");
          setConfirmCopy(false);
        }}
      >
        <p className={styles.sheetText}>
          Every day will use Monday’s hours: <strong>{daySummary(draft.mon)}</strong>. You can undo this right after.
        </p>
      </ConfirmSheet>
    </div>
  );
}
