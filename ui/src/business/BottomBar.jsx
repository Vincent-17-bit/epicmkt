import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPhone, faLocationArrow, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { actionProps, isPreview } from "../preview.js";
import styles from "./BottomBar.module.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

const resolve = (container) => (container && "current" in container ? container.current : container) ?? null;

export default function BottomBar({ callHref, whatsappHref, directionsHref, shareNote, mode = "live", container, onCall, onWhatsApp, onDirections, onShare }) {
  const act = actionProps(isPreview(mode));
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setTarget(resolve(container));
  }, [container]);

  const bar = (
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

  return target ? createPortal(bar, target) : bar;
}
