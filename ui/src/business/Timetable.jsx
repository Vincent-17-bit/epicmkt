import { WEEKDAYS } from "@epicmkt/shared";
import BusinessSection from "./BusinessSection.jsx";
import styles from "./Timetable.module.css";

// The weekly class timetable, grouped by day in time order. Days with no class are left out.
export default function Timetable({ slots }) {
  if (!slots?.length) return null;
  const days = WEEKDAYS.map((d) => ({ ...d, slots: slots.filter((s) => s.day === d.value).sort((a, b) => a.start.localeCompare(b.start)) })).filter((d) => d.slots.length);
  return (
    <BusinessSection title="Class timetable" id="timetable">
      <div className={styles.week}>
        {days.map((d) => (
          <div key={d.value} className={styles.day}>
            <h3 className={styles.dayName}>{d.label}</h3>
            <ul className={styles.slots}>
              {d.slots.map((s) => (
                <li key={s.id} className={styles.slot}>
                  <span className={styles.time}>{s.start} to {s.end}</span>
                  <span>{s.name}</span>
                  {s.trainer && <span className={styles.trainer}>{s.trainer}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </BusinessSection>
  );
}
