import { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleQuestion, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { Logo } from "@epicmkt/ui";
import { routes } from "../../config/routes.js";
import Skeleton from "../../components/Skeleton.jsx";
import { useSelectedTheme } from "./useSelectedTheme.js";
import { useRouteSeo } from "../../hooks/useRouteSeo.js";
import styles from "./layout.module.css";

export default function PublicSellerLayout() {
  useSelectedTheme();
  useRouteSeo();
  return (
    <div className={styles.root} id="seller-scroll">
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link to="/" className={styles.brand} aria-label="EpicMKT home">
            <Logo />
            <span className={styles.label}>Seller application</span>
          </Link>
          <nav className={styles.nav} aria-label="Seller application">
            <Link to={routes.applyStatus} className={styles.navLink}>
              <FontAwesomeIcon icon={faClipboardCheck} />
              <span className={styles.long}>Check my application</span>
              <span className={styles.short}>Check status</span>
            </Link>
            <Link to="/faq" className={styles.navLink}>
              <FontAwesomeIcon icon={faCircleQuestion} />
              <span>Help</span>
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" className={styles.main}>
        <Suspense fallback={<Skeleton height="60vh" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
