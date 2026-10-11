import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./Lightbox.module.css";

export default function Lightbox({ items, index, onIndex, onClose }) {
  const ref = useRef(null);
  const open = index != null;
  const item = open ? items[index] : null;

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
      if (event.key === "ArrowRight") onIndex((index + 1) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, items.length, onIndex]);

  const step = (dir) => () => onIndex((index + dir + items.length) % items.length);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label="Photo gallery"
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
    >
      {item && (
        <figure className={styles.figure}>
          <img src={item.url} alt={item.caption} className={styles.img} />
          <figcaption className={styles.caption}>
            {item.caption} · {index + 1} / {items.length}
          </figcaption>
        </figure>
      )}
      <button type="button" className={`${styles.btn} ${styles.close}`} aria-label="Close" onClick={onClose}>
        <FontAwesomeIcon icon={faXmark} />
      </button>
      {items.length > 1 && (
        <>
          <button type="button" className={`${styles.btn} ${styles.prev}`} aria-label="Previous photo" onClick={step(-1)}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button type="button" className={`${styles.btn} ${styles.next}`} aria-label="Next photo" onClick={step(1)}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </>
      )}
    </dialog>
  );
}
