import { useEffect, useState } from "react";
import { adminLink, isAdmin } from "./adminSession.js";
import styles from "./AdminQuickBar.module.css";

// Renders only for admins. `target` is { type: "business" | "item", id, label }.
export default function AdminQuickBar({ target }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let live = true;
    isAdmin().then((ok) => live && setAdmin(ok));
    return () => {
      live = false;
    };
  }, []);

  if (!admin || !target?.id) return null;
  return (
    <aside className={styles.bar} aria-label="Admin quick bar">
      <span className={styles.tag}>Admin</span>
      <span className={styles.label}>{target.label}</span>
      <a className={styles.link} href={adminLink("/admin/businesses", target)} target="_blank" rel="noopener noreferrer">
        Peek in admin
      </a>
    </aside>
  );
}
