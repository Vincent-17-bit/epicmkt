import styles from "./HoursTable.module.css";

export default function HoursTable({ rows }) {
  return (
    <table className={styles.hours}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.day} className={row.today ? styles.today : undefined} aria-current={row.today ? "date" : undefined}>
            <th scope="row">{row.name}</th>
            <td>{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
