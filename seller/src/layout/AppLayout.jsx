import { NavLink, Outlet } from "react-router-dom";
import AuthGate from "../auth/AuthGate.jsx";
import { Toaster } from "../components/ui/index.js";
import styles from "./AppLayout.module.css";

export default function AppLayout() {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <span className={styles.brand}>EpicMKT Seller</span>
        <nav aria-label="Seller sections" className={styles.nav}>
          <NavLink to="/business/hours" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ""}`}>
            Hours and closures
          </NavLink>
        </nav>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>
        <AuthGate>
          <Outlet />
        </AuthGate>
      </main>
      <Toaster />
    </div>
  );
}
