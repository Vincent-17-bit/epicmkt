import { useSession } from "../state/session.js";
import styles from "./dashboard/dashboard.module.css";

const date = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" });

export default function Notifications() {
  const me = useSession((s) => s.me);
  const markAllRead = useSession((s) => s.markAllRead);
  const unread = me.notifications.some((n) => !n.read);
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h1 className={styles.headline}>Notifications</h1>
        {unread && <button type="button" className={styles.linkBtn} onClick={markAllRead}>Mark all read</button>}
      </div>
      {me.notifications.length === 0 ? (
        <p className={styles.muted}>No notifications yet.</p>
      ) : (
        <ul className={styles.list}>
          {me.notifications.map((n) => (
            <li key={n.id} data-unread={n.read ? undefined : "true"}>
              <strong>{n.title}</strong>
              <span>{n.body}</span>
              <span className={styles.muted}>{date.format(new Date(n.created_at))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
