import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronRight, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { qualityLabel, qualityScore } from "./model.js";
import styles from "./editor.module.css";

// The quality meter and what would raise it. Advisory: every suggestion is a link to the field, none of it blocks a save.
export default function QualityPanel({ checks, onJump, showDone = true, headingLevel = "h3", issues = null }) {
  const score = qualityScore(checks);
  const todo = checks.filter((c) => !c.done);
  const done = checks.filter((c) => c.done);
  const Heading = headingLevel;
  return (
    <div className={styles.quality} data-testid="quality">
      <div className={styles.meterHead}>
        <Heading className={styles.subTitle}>Listing quality</Heading>
        <span className={styles.score} data-testid="quality-score">{score}% <span className={styles.scoreWord}>{qualityLabel(score)}</span></span>
      </div>
      <div className={styles.track} role="progressbar" aria-label="Listing quality" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-valuetext={`${score} percent, ${qualityLabel(score)}`}>
        <span className={styles.fill} style={{ inlineSize: `${score}%` }} />
      </div>
      {todo.length === 0 ? (
        <p className={styles.hint}>Nothing left to suggest. This listing is complete.</p>
      ) : (
        <>
          <p className={styles.hint}>These are suggestions. You can save without them.</p>
          <ul className={styles.todoList}>
            {todo.map((c) => (
              <li key={c.id}>
                <button type="button" className={styles.jump} onClick={() => onJump(c.step, c.focus)}>
                  <span>{c.todo}</span>
                  <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {issues && (
        <div data-testid="spec-quality">
          <Heading className={styles.subTitle}>Item details</Heading>
          <p className={styles.hint} data-testid="spec-score">{issues.score}% of the recommended details are filled in.</p>
          <div className={styles.track} role="progressbar" aria-label="Item details" aria-valuemin={0} aria-valuemax={100} aria-valuenow={issues.score} aria-valuetext={`${issues.score} percent`}>
            <span className={styles.fill} style={{ inlineSize: `${issues.score}%` }} />
          </div>
          {issues.blockers.length > 0 && (
            <ul className={styles.todoList} aria-label="Needed to publish">
              {issues.blockers.map((b) => (
                <li key={b.id}>
                  <button type="button" className={`${styles.jump} ${styles.jumpBad}`} onClick={() => onJump(b.step, b.focus)}>
                    <span><FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" /> <strong>Needed to publish:</strong> {b.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {issues.warnings.length > 0 && (
            <ul className={styles.todoList} aria-label="Suggested details">
              {issues.warnings.map((w) => (
                <li key={w.id}>
                  <button type="button" className={styles.jump} onClick={() => onJump(w.step, w.focus)}>
                    <span>{w.message}</span>
                    <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showDone && done.length > 0 && (
        <ul className={styles.doneList} aria-label="Already done">
          {done.map((c) => (
            <li key={c.id}><FontAwesomeIcon icon={faCheck} aria-hidden="true" /> {c.done_text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
