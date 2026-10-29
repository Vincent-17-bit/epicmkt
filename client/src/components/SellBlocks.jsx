import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faStore } from "@fortawesome/free-solid-svg-icons";
import Container from "./Container.jsx";
import Button from "./Button.jsx";
import styles from "./SellBlocks.module.css";

// Where "List my business" goes: the real application, not a placeholder page.
export const APPLY_PATH = "/become-a-seller";

// Where "Get the plans PDF" goes: the contact page, with the message to the admin already written.
export const PLANS_PDF_PATH = "/contact?topic=plans";

/** The light-blue opening block of the seller pages: icon, headline, one line of copy, buttons and a small note. */
export function SellHero({ id, title, text, actions, note }) {
  return (
    <section className={styles.hero} aria-labelledby={id}>
      <Container className={styles.heroInner}>
        <span className={styles.heroIcon}>
          <FontAwesomeIcon icon={faStore} />
        </span>
        <h1 id={id} className={styles.heroTitle}>
          {title}
        </h1>
        <p className={styles.heroText}>{text}</p>
        {actions && <div className={styles.heroActions}>{actions}</div>}
        {note && <p className={styles.heroNote}>{note}</p>}
      </Container>
    </section>
  );
}

/** The dark "Ready to be found?" block that closes the seller pages. */
export function FinalCta({ to = APPLY_PATH }) {
  return (
    <Container as="section" className={styles.section} aria-labelledby="final-title">
      <div className={styles.final}>
        <h2 id="final-title" className={styles.finalTitle}>
          Ready to be found?
        </h2>
        <p>Register your business and start getting calls and WhatsApp messages from people nearby.</p>
        <Button as={Link} to={to} variant="dark" size="lg" iconRight={faArrowRight}>
          List my business
        </Button>
      </div>
    </Container>
  );
}
