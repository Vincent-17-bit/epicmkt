import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { paragraphs } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import styles from "./ItemDescription.module.css";

// The full description. Paragraph breaks are kept. Below 768 px it is clamped to a few lines with a Read more / Read less
// toggle (the clamp is CSS, so wide screens show everything); the button only appears when the text really overflows.
export default function ItemDescription({ text }) {
  const id = useId();
  const bodyRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const parts = paragraphs(text);

  const measure = () => {
    const el = bodyRef.current;
    if (!el || open) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  };
  useLayoutEffect(measure, [text, open]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    const watcher = typeof ResizeObserver === "function" && bodyRef.current ? new ResizeObserver(measure) : null;
    watcher?.observe(bodyRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      watcher?.disconnect();
    };
  }, [text, open]);

  if (!parts.length) return null;
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`} data-description="">
      <h3 id={`${id}-title`} className={styles.title}>
        {t("item.description")}
      </h3>
      <div ref={bodyRef} id={`${id}-body`} className={styles.body} data-open={open ? "true" : "false"}>
        {parts.map((part, index) => (
          <p key={index} className={styles.paragraph}>
            {part}
          </p>
        ))}
      </div>
      {(overflows || open) && (
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((v) => !v)}>
          {open ? t("item.readLess") : t("item.readMore")}
        </button>
      )}
    </section>
  );
}
