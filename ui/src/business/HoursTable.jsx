import { DAY_NAMES, WEEK, formatTime } from "@epicmkt/shared";
import styles from "./HoursTable.module.css";

export default function HoursTable({ hours, today }) {
  return (
    <table className={styles.hours}>
      <tbody>
        {WEEK.map((day) => (
          <tr key={day} className={day === today ? styles.today : undefined} aria-current={day === today ? "date" : undefined}>
            <th scope="row">{DAY_NAMES[day]}</th>
            <td>{hours[day] ? `${formatTime(hours[day][0])} to ${formatTime(hours[day][1])}` : "Closed"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
