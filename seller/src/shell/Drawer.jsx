import { useEffect, useRef } from "react";
import { NavList } from "./Sidebar.jsx";
import styles from "./shell.module.css";

export default function Drawer({ open, onClose, unread, attention }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.drawer} aria-label="Menu" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className={styles.drawerBody}>
        <div className={styles.sideBrand}>
          <span className={styles.mark} aria-hidden="true">E</span>
          <span className={styles.sideWord}>EpicMKT Business</span>
        </div>
        <NavList unread={unread} attention={attention} onNavigate={onClose} className={styles.drawerNav} />
      </div>
    </dialog>
  );
}
