import { useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import styles from "./legal.module.css";

export default function LegalDialog({ doc, open, onClose, onRead }) {
  const dialog = useRef(null);
  const body = useRef(null);

  const check = () => {
    const el = body.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) onRead();
  };

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      requestAnimationFrame(check);
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="legal-title" onClose={onClose} onCancel={onClose}>
      {doc && (
        <div className={styles.inner}>
          <header className={styles.head}>
            <h2 id="legal-title">{doc.title}</h2>
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </header>
          <div ref={body} className={styles.body} tabIndex={0} onScroll={check} aria-label={`${doc.title} full text`}>
            <section className={styles.points}>
              <h3>Key points</h3>
              <ul>
                {doc.key_points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
            {doc.body.split(/\n\n+/).map((para, i) => (
              <p key={i} className={styles.para}>
                {para}
              </p>
            ))}
            <p className={styles.end}>End of document. Version {doc.version}.</p>
          </div>
          <footer className={styles.foot}>
            <button type="button" className={styles.done} onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
