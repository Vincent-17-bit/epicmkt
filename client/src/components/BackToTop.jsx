import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import styles from "./BackToTop.module.css";

const MIN_DEPTH = 600;
const MIN_PAGES = 2.5;
const NUDGE = 8;

export default function BackToTop({ hidden = false, lifted = false }) {
  const [shown, setShown] = useState(false);
  const last = useRef(0);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const y = window.scrollY;
      const view = window.innerHeight;
      const delta = y - last.current;
      const footer = document.querySelector("footer");
      const atFooter = footer ? footer.getBoundingClientRect().top < view : false;
      const deep = y > Math.max(MIN_DEPTH, view * 1.5);
      const long = document.documentElement.scrollHeight > view * MIN_PAGES;
      if (!deep || !long || atFooter) setShown(false);
      else if (delta < -NUDGE) setShown(true);
      else if (delta > NUDGE) setShown(false);
      if (Math.abs(delta) > NUDGE) last.current = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    last.current = window.scrollY;
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  const visible = shown && !hidden;

  return (
    <button
      type="button"
      className={`${styles.btn} ${visible ? styles.visible : ""} ${lifted ? styles.lifted : ""}`}
      onClick={toTop}
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
    >
      <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
      <span>Top</span>
    </button>
  );
}
