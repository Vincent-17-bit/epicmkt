import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircle, faCircleDot } from "@fortawesome/free-solid-svg-icons";
import { timelineSteps } from "./statusMeta.js";
import styles from "./status.module.css";

export default function Timeline({ app }) {
  const steps = timelineSteps(app);
  const current = steps.findIndex(([key]) => key === app.status);
  const finished = app.status === "activated";
  return (
    <ol className={styles.timeline} aria-label="Application progress">
      {steps.map(([key, label], i) => {
        const state = i < current || (finished && i === current) ? "done" : i === current ? "now" : "next";
        return (
          <li key={key} data-state={state} aria-current={state === "now" ? "step" : undefined}>
            <FontAwesomeIcon icon={state === "done" ? faCheck : state === "now" ? faCircleDot : faCircle} />
            <span>{label}</span>
            <small>{state === "done" ? "Done" : state === "now" ? "Current" : "Next"}</small>
          </li>
        );
      })}
    </ol>
  );
}
