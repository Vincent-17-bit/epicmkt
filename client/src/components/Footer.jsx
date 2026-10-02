import { Link } from "react-router-dom";
import Container from "./Container.jsx";
import Logo from "./Logo.jsx";
import ThemeSwitch from "./ThemeSwitch.jsx";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.about}>
          <Logo />
          <p className={styles.text}>
            EpicMKT lists local businesses so you can call, WhatsApp or get directions. We do not take orders or payments.
          </p>
        </div>
        <nav className={styles.nav} aria-label="Footer">
          <Link to="/" className={styles.link}>
            Home
          </Link>
          <Link to="/#categories" className={styles.link}>
            Categories
          </Link>
          <Link to="/privacy" className={styles.link}>
            Privacy
          </Link>
          <Link to="/terms" className={styles.link}>
            Terms
          </Link>
        </nav>
        <ThemeSwitch />
      </Container>
      <Container className={styles.legal}>
        <small>&copy; {new Date().getFullYear()} EpicMKT</small>
      </Container>
    </footer>
  );
}
