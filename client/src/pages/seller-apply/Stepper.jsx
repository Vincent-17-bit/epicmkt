import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faClock, faFloppyDisk } from "@fortawesome/free-solid-svg-icons";
import { STEPS } from "./formModel.js";
import styles from "./stepper.module.css";

/** Phones: a slim sticky bar. Laptops and up: a numbered list beside the form. */
export default function Stepper({ index, onJump }) {
  const left = STEPS.length - index - 1;
  return (
    <nav aria-label="Application progress" className={styles.wrap}>
      <p className={styles.phone}>
        <strong>
          Step {index + 1} of {STEPS.length}
        </strong>
        <span>{STEPS[index].title}</span>
      </p>
      <div className={styles.bar} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1} aria-label="Progress">
        <span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
      </div>
      <ol className={styles.list}>
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === index ? "step" : undefined} data-state={i < index ? "done" : i === index ? "now" : "todo"}>
            <button type="button" disabled={i > index} onClick={() => onJump(i)}>
              <span className={styles.dot}>{i < index ? <FontAwesomeIcon icon={faCheck} /> : i + 1}</span>
              <span className={styles.name}>{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className={styles.eta}>
        <FontAwesomeIcon icon={faClock} /> {left === 0 ? "Last step" : `About ${Math.max(1, left)} min to go`}
      </p>
      <p className={styles.saved}>
        <FontAwesomeIcon icon={faFloppyDisk} /> Saved on this device as you type
      </p>
    </nav>
  );
}
