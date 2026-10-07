import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons";
import styles from "./Accordion.module.css";

export default function Accordion({ items, idPrefix = "faq", level = 2 }) {
  const [openIndex, setOpenIndex] = useState(null);
  const Heading = `h${level}`;
  return (
    <div className={styles.list}>
      {items.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} className={`${styles.item} ${open ? styles.open : ""}`}>
            <Heading className={styles.heading}>
              <button
                type="button"
                className={styles.summary}
                id={`${idPrefix}-q-${i}`}
                aria-expanded={open}
                aria-controls={`${idPrefix}-a-${i}`}
                onClick={() => setOpenIndex(open ? null : i)}
              >
                <span>{item.q}</span>
                <FontAwesomeIcon icon={open ? faMinus : faPlus} className={styles.icon} />
              </button>
            </Heading>
            <div id={`${idPrefix}-a-${i}`} role="region" aria-labelledby={`${idPrefix}-q-${i}`} className={styles.panel}>
              <div className={styles.clip}>
                <p className={styles.answer}>{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
