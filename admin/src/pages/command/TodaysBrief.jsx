import { useNavigate } from "react-router-dom";
import { Button, Card, Chip, Skeleton } from "../../components/index.js";
import Icon from "../../components/Icon.jsx";
import { buildBrief } from "../../lib/brief.js";
import { eatDayLabel } from "../../lib/series.js";
import s from "./command.module.css";

const TONE = {
  urgent: { chip: "danger", icon: "warn", label: "Needs you now" },
  busy: { chip: "info", icon: "bell", label: "Busy day" },
  calm: { chip: "success", icon: "check", label: "All clear" },
};

/** One rule-based sentence from the counts, and up to three buttons that go straight to the work. */
export default function TodaysBrief({ counts, waitingOver24h, can, loading, now }) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <Card className={s.brief} aria-busy="true" aria-label="Today's brief">
        <Skeleton variant="text" width="9rem" /><Skeleton variant="text" width="80%" height="1.6rem" /><Skeleton variant="rect" width="18rem" height="2.75rem" />
      </Card>
    );
  }
  const brief = buildBrief(counts, { waitingOver24h, can });
  const tone = TONE[brief.tone];
  return (
    <Card as="section" className={s.brief} data-tone={brief.tone} aria-labelledby="brief-eyebrow">
      <div className={s.briefTop}>
        <h2 id="brief-eyebrow" className={s.eyebrow}>Today’s brief · {eatDayLabel(now)}</h2>
        <Chip tone={tone.chip} icon={<Icon name={tone.icon} />}>{tone.label}</Chip>
      </div>
      <p className={s.briefText} role="status">{brief.text}</p>
      {brief.actions.length > 0 ? (
        <div className={s.briefActions}>
          {brief.actions.map((action) => (
            <Button key={action.id} variant={action.primary ? "primary" : "secondary"} onClick={() => navigate(action.to)}>{action.label}</Button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
