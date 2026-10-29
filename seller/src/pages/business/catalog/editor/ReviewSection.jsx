import { validateItemForm } from "@epicmkt/shared";
import { errorList, priceSummary } from "./model.js";
import { SectionCard } from "./parts.jsx";
import QualityPanel from "./Quality.jsx";
import styles from "./editor.module.css";

export default function ReviewSection({ form, checks, isNew, onJump }) {
  const check = validateItemForm(form);
  const problems = check.ok ? [] : errorList(check.errors);
  const listed = [
    form.highlights.filter((h) => h.text.trim()).length && `${form.highlights.filter((h) => h.text.trim()).length} highlights`,
    form.specs.filter((s) => s.label.trim() && s.value.trim()).length && `${form.specs.filter((s) => s.label.trim() && s.value.trim()).length} specifications`,
    form.includes.filter((t) => t.trim()).length && `${form.includes.filter((t) => t.trim()).length} included`,
  ].filter(Boolean);

  return (
    <SectionCard id="review" title="Review" why="A last look at what is missing. Nothing here stops you from saving, except the things marked Fix first.">
      {problems.length > 0 && (
        <div className={styles.blockers} data-testid="review-problems">
          <h3 className={styles.subTitle}>Fix first</h3>
          <ul className={styles.todoList}>
            {problems.map((p) => (
              <li key={p.key}>
                <button type="button" className={`${styles.jump} ${styles.jumpBad}`} onClick={() => onJump(p.step, p.focus)}>
                  <span><strong>{p.label}:</strong> {p.message}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.glance}>
        <h3 className={styles.subTitle}>What customers will see</h3>
        <p className={styles.glanceName}>{form.name.trim() || <span className={styles.muted}>No name yet</span>}</p>
        {form.shortDescription.trim() && <p className={styles.glanceShort}>{form.shortDescription.trim()}</p>}
        <p>{priceSummary(form)}</p>
        {listed.length > 0 && <p className={styles.muted}>{listed.join(", ")}</p>}
        {isNew && <p className={styles.hint}>New items are saved as drafts. Use Show when you are ready for customers to see them.</p>}
      </div>

      <QualityPanel checks={checks} onJump={onJump} />
    </SectionCard>
  );
}
