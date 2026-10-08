import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { actionProps, isPreview } from "../preview.js";
import styles from "./BottomBar.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

export default function BottomBar({ callHref, whatsappHref, directionsHref, shareNote, mode = "live", onCall, onWhatsApp, onDirections, onShare }) {
  const act = actionProps(isPreview(mode));

  return (
    <nav className={styles.bar} aria-label="Contact actions">
      <a className={styles.barItem} {...act.link(callHref, onCall)}>
        <FontAwesomeIcon icon={faPhone} />
        <span>Call</span>
      </a>
      <a className={styles.barItem} {...act.link(whatsappHref, onWhatsApp, external)}>
        <FontAwesomeIcon icon={faWhatsapp} />
        <span>WhatsApp</span>
      </a>
      <a className={styles.barItem} {...act.link(directionsHref, onDirections, external)}>
        <FontAwesomeIcon icon={faLocationArrow} />
        <span>Directions</span>
      </a>
      <button type="button" className={styles.barItem} {...act.button(onShare)}>
        <FontAwesomeIcon icon={faShareNodes} />
        <span>{shareNote || "Share"}</span>
      </button>
    </nav>
  );
}
