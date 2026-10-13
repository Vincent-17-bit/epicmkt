import { computeStatus, WEEK, DAY_NAMES, dowOf, dateKeyOf, normalizeExceptions, addDays } from "@epicmkt/shared/hours";
import { ClosureBanner, PartialClosureNote, StatusIcon } from "../../components/ui/index.js";
import { daySummary, longDate } from "./format.js";
import styles from "./hours.module.css";

const TONE = { open: "tOpen", closing_soon: "tClosing", closed: "tClosed", closed_temporarily: "tClosed", opens_later: "tLater" };

export default function CustomerPreview({ data, draftHours, dirty, now }) {
  const business = { hours: draftHours, exceptions: data.exceptions, override: data.override, partial_closures: data.partial_closures };
  const status = computeStatus(business, now);
  const today = dowOf(now);
  const todayKey = dateKeyOf(now);
  const horizon = addDays(todayKey, 14);
  const upcoming = normalizeExceptions(data.exceptions).filter((e) => e.date >= todayKey && e.date <= horizon);

  return (
    <div className={styles.preview}>
      {dirty && <p className={styles.hint}>This preview includes your unsaved weekly hours.</p>}
      <article className={styles.previewCard} aria-label="Customer preview">
        <h3 className={styles.previewName}>{data.name}</h3>
        <p className={`${styles.previewStatus} ${styles[TONE[status.state]]}`} data-testid="preview-status">
          <StatusIcon name={status.state} size={20} />
          <span>
            {status.label} · {status.detail}
          </span>
        </p>
        <ClosureBanner status={status} />
        {status.partials.map((p) => (
          <PartialClosureNote key={`${p.scope}-${p.section ?? ""}`} partial={p} now={now} />
        ))}
        <table className={styles.previewTable}>
          <caption className={styles.previewCaption}>Opening hours</caption>
          <tbody>
            {WEEK.map((d) => (
              <tr key={d} className={d === today ? styles.previewToday : undefined}>
                <th scope="row">{DAY_NAMES[d]}</th>
                <td>{daySummary(draftHours[d])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {upcoming.length > 0 && (
          <div>
            <p className={styles.previewCaption}>Special dates</p>
            <ul className={styles.previewList}>
              {upcoming.map((e) => (
                <li key={e.date}>
                  <strong>{longDate(e.date)}</strong>: {daySummary(e)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </div>
  );
}
