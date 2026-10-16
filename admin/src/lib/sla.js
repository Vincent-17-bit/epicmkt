// The 24-hour review SLA for the applications queue.
//
// The clock starts when the seller submits and runs while the application is still `submitted`. It stops when a
// reviewer starts the review (status `under_review`). This is the same line the Command Center draws for
// "waiting over 24 h" (api/live.js getDashboard), so the two screens never disagree.
//
// All the numbers live here. If the spec changes the target or the warning point, change these two constants.
import { durationText } from "./series.js";

export const SLA_HOURS = 24;
export const SLA_WARN_HOURS = 18; // from here the row says "due soon"

const MINUTE = 60_000;
const HOUR = 3_600_000;
export const SLA_MS = SLA_HOURS * HOUR;
export const SLA_WARN_MS = SLA_WARN_HOURS * HOUR;

/** "40 min", "5 h 20 min". Used for time left; time over uses durationText (rounder, because it is already late). */
function exact(ms) {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * @param app { status, submitted_at, review_started_at? }
 * @returns { state: "ok" | "soon" | "breached" | "met" | "missed" | "none", label, detail, elapsedMs, progress, tone }
 *   ok/soon/breached  the clock is running (status submitted)
 *   met/missed        a reviewer started the review inside / after the 24 h (status under_review)
 *   none              the SLA does not apply (no timestamp, or the application is past review)
 * tone is one of the admin chip tones, so the badge never depends on colour alone (it also has a label and an icon).
 */
export function slaState(app, now = new Date()) {
  const none = { state: "none", label: "No SLA", detail: "", elapsedMs: 0, progress: 0, tone: "neutral" };
  const submitted = app?.submitted_at ? Date.parse(app.submitted_at) : NaN;
  if (!Number.isFinite(submitted)) return none;

  if (app.status === "submitted") {
    const elapsedMs = Math.max(0, now.getTime() - submitted);
    const progress = Math.min(1, elapsedMs / SLA_MS);
    if (elapsedMs >= SLA_MS) {
      return { state: "breached", label: "Overdue", detail: `${durationText(elapsedMs - SLA_MS)} over`, elapsedMs, progress: 1, tone: "danger" };
    }
    const left = exact(SLA_MS - elapsedMs);
    if (elapsedMs >= SLA_WARN_MS) return { state: "soon", label: "Due soon", detail: `${left} left`, elapsedMs, progress, tone: "warning" };
    return { state: "ok", label: "On time", detail: `${left} left`, elapsedMs, progress, tone: "success" };
  }

  if (app.status === "under_review" && app.review_started_at) {
    const started = Date.parse(app.review_started_at);
    if (Number.isFinite(started)) {
      const elapsedMs = Math.max(0, started - submitted);
      const met = elapsedMs <= SLA_MS;
      return { state: met ? "met" : "missed", label: met ? "Met" : "Missed", detail: `Picked up after ${durationText(elapsedMs)}`, elapsedMs, progress: Math.min(1, elapsedMs / SLA_MS), tone: met ? "success" : "danger" };
    }
  }
  return none;
}

/**
 * ISO cut-offs for the SLA filter, as submitted_at bounds for rows that are still `submitted`.
 *   breached  submitted_at <  breach          (waited 24 h or more)
 *   soon      breach <= submitted_at < warn   (waited 18 h up to 24 h)
 *   ok        submitted_at >= warn            (waited under 18 h)
 */
export function slaCutoffs(now = new Date()) {
  return { breach: new Date(now.getTime() - SLA_MS).toISOString(), warn: new Date(now.getTime() - SLA_WARN_MS).toISOString() };
}

export const SLA_FILTERS = [
  { id: "breached", label: "Overdue (over 24 h)" },
  { id: "soon", label: "Due soon (18 to 24 h)" },
  { id: "ok", label: "On time (under 18 h)" },
];
