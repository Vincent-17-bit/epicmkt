import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { resizedUrl, srcSetFor } from "../lib/imageUrl.js";
import styles from "./Lightbox.module.css";

// The zoomed picture. The 800 px copy is the one the gallery slide already downloaded, so it paints at once from the
// browser cache; the sharper copy loads on top of it and fades in. Neighbours are fetched ahead so stepping is instant too.
function ZoomImage({ url, alt }) {
  const [sharp, setSharp] = useState(false);
  const set = srcSetFor(url);
  return (
    <span className={styles.stack}>
      <img src={resizedUrl(url, 800)} alt="" aria-hidden="true" className={styles.img} decoding="async" />
      <img
        src={resizedUrl(url, 1600)}
        srcSet={set}
        sizes="100vw"
        alt={alt}
        className={`${styles.img} ${styles.sharp}`}
        data-ready={sharp ? "true" : "false"}
        decoding="async"
        onLoad={() => setSharp(true)}
      />
    </span>
  );
}

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

  useEffect(() => {
    if (!open || items.length < 2) return;
    [-1, 1].forEach((dir) => {
      const near = items[(index + dir + items.length) % items.length];
      if (near?.url) new Image().src = resizedUrl(near.url, 1600);
    });
  }, [open, index, items]);

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
          <ZoomImage key={item.url} url={item.url} alt={item.caption} />
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
