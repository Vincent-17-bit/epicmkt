import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faStore } from "@fortawesome/free-solid-svg-icons";
import Button from "./Button.jsx";
import styles from "./ListBusinessBanner.module.css";

/** The blue "List your business" strip. `titleId` lets the section that holds it label itself with the heading. */
export default function ListBusinessBanner({ to = "/sell", titleId = "list-business-title" }) {
  return (
    <div className={styles.cta}>
      <span className={styles.ctaIcon}>
        <FontAwesomeIcon icon={faStore} />
      </span>
      <div className={styles.ctaText}>
        <h2 id={titleId} className={styles.ctaTitle}>
          List your business
        </h2>
        <p className={styles.ctaCopy}>Get found by customers nearby.</p>
      </div>
      <Button as={Link} to={to} variant="dark" iconRight={faArrowRight} className={styles.ctaButton}>
        Become a seller
      </Button>
    </div>
  );
}
