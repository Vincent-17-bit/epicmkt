import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faClock, faHourglassHalf, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Chip } from "../../components/index.js";
import { slaState } from "../../lib/sla.js";
import s from "./applications.module.css";

const ICON = { ok: faClock, soon: faHourglassHalf, breached: faTriangleExclamation, met: faCircleCheck, missed: faTriangleExclamation };

/**
 * The 24-hour SLA for one application: a chip (icon, word and tone, never colour alone), the time left or over, and a
 * thin meter while the clock is running. Renders a quiet dash when the SLA does not apply.
 */
export default function SlaBadge({ application, now, compact = false }) {
  const sla = slaState(application, now);
  if (sla.state === "none") return <span className={s.muted} aria-label="No SLA">&mdash;</span>;
  const running = sla.state === "ok" || sla.state === "soon" || sla.state === "breached";
  return (
    <span className={s.sla} data-state={sla.state}>
      <Chip tone={sla.tone} icon={<FontAwesomeIcon icon={ICON[sla.state]} fixedWidth />}>{sla.label}</Chip>
      {sla.detail ? <span className={s.slaDetail}>{sla.detail}</span> : null}
      {running && !compact ? (
        <span className={s.meter} role="presentation" aria-hidden="true"><span className={s.meterFill} style={{ width: `${Math.round(sla.progress * 100)}%` }} /></span>
      ) : null}
    </span>
  );
}
