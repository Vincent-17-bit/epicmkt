import styles from "./HoursTable.module.css";

// Rows: { day, name, today, text, changed?, dateLabel?, note? }. A row with `changed` is a one-off exception for that
// date, so it carries the date, a "This date only" tag and the seller's note. The note is the seller's own text and is
// rendered as plain text (React escapes it). A row without an exception renders only the weekday and the hours.
// Rows may also carry { shopLabel, viewerText, viewerLabel } (see hoursRowsFor): the shop's zone name is printed next to
// its hours, and when the viewer's clock reads differently the same hours follow in the viewer's time.
export default function HoursTable({ rows, caption }) {
  return (
    <table className={styles.hours}>
      {caption && <caption className={styles.caption}>{caption}</caption>}
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
              <span>{row.text}</span>
              {row.shopLabel && row.text !== "Closed" && <span className={styles.zone}> {row.shopLabel}</span>}
              {row.viewerText && (
                <span className={styles.viewer} data-testid="viewer-hours" title={row.viewerLabel || undefined}>
                  {row.viewerText} your time
                </span>
              )}
              {row.note && <span className={styles.note}>{row.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
