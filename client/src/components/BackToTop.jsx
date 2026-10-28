import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import styles from "./BackToTop.module.css";

const SHOW_AFTER = 480;

export default function BackToTop({ hidden = false }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const sync = () => setShown(window.scrollY > SHOW_AFTER);
    sync();
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  const visible = shown && !hidden;

  return (
    <button type="button" className={`${styles.btn} ${visible ? styles.visible : ""}`} onClick={toTop} tabIndex={visible ? 0 : -1} aria-hidden={visible ? undefined : true}>
      <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
      <span>Top</span>
    </button>
  );
}
