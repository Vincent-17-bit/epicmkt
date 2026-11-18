import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import styles from "./BackToTop.module.css";

const MIN_DEPTH = 80;
const MIN_PAGES = 1.5;

const calm = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const toTop = () => window.scrollTo({ top: 0, behavior: calm() ? "auto" : "smooth" });

export default function BackToTop({ hidden = false, lifted = false, liftedUntil = "56rem", onTop = toTop, label = "Top" }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      const view = window.innerHeight;
      const footer = [...document.querySelectorAll("footer")].reverse().find((f) => !/fixed|sticky/.test(getComputedStyle(f).position));
      const atFooter = footer ? footer.getBoundingClientRect().top < view : false;
      const deep = window.scrollY > MIN_DEPTH;
      const long = document.documentElement.scrollHeight > view * MIN_PAGES;
      setShown(deep && long && !atFooter);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const visible = shown && !hidden;

  return (
    <button
      type="button"
      className={`${styles.backTop} ${visible ? styles.backTopOn : ""}`}
      data-lifted={lifted ? liftedUntil : undefined}
      onClick={onTop}
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
    >
      <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
