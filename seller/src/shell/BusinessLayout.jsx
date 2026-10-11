import { NavLink, Outlet, Link } from "react-router-dom";
import { Toaster } from "../ui/ui.jsx";
import styles from "./shell.module.css";

export function BusinessLayout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>EpicMKT <span>Seller</span></span>
        <nav aria-label="Seller portal">
          <NavLink to="/business/catalog" className={({ isActive }) => (isActive ? styles.on : undefined)}>Catalog</NavLink>
          <NavLink to="/business/plan" className={({ isActive }) => (isActive ? styles.on : undefined)}>Plan</NavLink>
        </nav>
      </header>
      <main className={styles.main}><Outlet /></main>
      <Toaster />
    </div>
  );
}

export function NotFound() {
  return (
    <div className={styles.plain}>
      <h1>Page not found</h1>
      <Link to="/business/catalog">Go to your catalog</Link>
    </div>
  );
}
