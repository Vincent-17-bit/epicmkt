import { useId } from "react";
import { earliestInput, quickPicks, scheduleProblem } from "../lib/schedule.js";
import { nairobiInputToUtcIso, formatNairobiDateTime } from "../lib/time.js";

// Choose when a message goes out: empty means now. The time is Nairobi time; ready-made picks sit under the field.
// The server sends it when the time comes, whether or not anyone is signed in.
export default function SchedulePicker({ value, onChange, label = "Send at (optional, Nairobi time)", now = new Date() }) {
  const hintId = useId();
  const problem = scheduleProblem(value, now);
  const when = !problem && value ? nairobiInputToUtcIso(value) : "";
  return (
    <div className="schedule">
      <label className="field">{label}
        <input type="datetime-local" value={value} min={earliestInput(now)} aria-invalid={problem ? "true" : undefined} aria-describedby={hintId} onChange={(e) => onChange(e.target.value)} />
      </label>
      <div className="schedule__picks" role="group" aria-label="Quick times">
        <button type="button" className={`schedule__chip${value ? "" : " is-on"}`} aria-pressed={!value} onClick={() => onChange("")}>Send now</button>
        {quickPicks(now).map((pick) => (
          <button key={pick.id} type="button" className={`schedule__chip${value === pick.value ? " is-on" : ""}`} aria-pressed={value === pick.value} onClick={() => onChange(pick.value)}>{pick.label}</button>
        ))}
      </div>
      <p id={hintId} className={problem ? "modal__error" : "muted"} role={problem ? "alert" : undefined} data-testid={problem ? undefined : "send-at"}>
        {problem || (when ? `Will send ${formatNairobiDateTime(when)}. It goes out by itself, even when nobody is signed in.` : "Goes out within a minute of sending (promotional messages wait until quiet hours end).")}
      </p>
    </div>
  );
}
