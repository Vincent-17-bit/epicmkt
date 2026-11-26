import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import styles from "./SeeMoreButton.module.css";

/**
 * The "See more" button that ends a section header. It is a real link, so it opens `to` the normal way (new tab, copy
 * link, back button). The words on the button stay short; `label` is the longer name a screen reader announces
 * ("See more featured businesses") and always starts with the visible words, as accessibility rules ask.
 */
export default function SeeMoreButton({ to, label, children = "See more", className = "" }) {
  return (
    <Link to={to} className={`${styles.button} ${className}`.trim()} aria-label={label && label !== children ? label : undefined}>
      <span className={styles.text}>{children}</span>
      <span className={styles.disc} aria-hidden="true">
        <FontAwesomeIcon icon={faArrowRight} />
      </span>
    </Link>
  );
}
