import styles from "./HoursTable.module.css";

// Rows: { day, name, today, text, changed?, dateLabel?, note? }. A row with `changed` is a one-off exception for that
// date, so it carries the date, a "This date only" tag and the seller's note. The note is the seller's own text and is
// rendered as plain text (React escapes it). A row without an exception renders only the weekday and the hours.
export default function HoursTable({ rows }) {
  return (
    <table className={styles.hours}>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.day}
            className={row.today ? styles.today : undefined}
            aria-current={row.today ? "date" : undefined}
            data-changed={row.changed ? "true" : undefined}
            data-closed={row.changed && row.text === "Closed" ? "true" : undefined}
          >
            <th scope="row">
              {row.name}
              {row.changed && row.dateLabel && <span className={styles.date}> {row.dateLabel}</span>}
              {row.changed && <span className={styles.tag}>This date only</span>}
            </th>
            <td>
              {row.text}
              {row.note && <span className={styles.note}>{row.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
