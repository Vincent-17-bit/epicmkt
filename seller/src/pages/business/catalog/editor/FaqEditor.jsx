import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { FAQ_GROUP, FAQ_LIMITS, SPEC_LIMITS, faqRows, isFaqGroup } from "@epicmkt/shared";
import { Field, RowList } from "./parts.jsx";
import styles from "./editor.module.css";

export default function FaqEditor({ specs, onChange, focusOn, usedElsewhere }) {
  const rows = faqRows(specs);
  const rest = specs.filter((s) => !isFaqGroup(s.group));
  const max = Math.min(FAQ_LIMITS.rows, SPEC_LIMITS.rows - usedElsewhere);
  const write = (next) => onChange([...rest, ...next.map((r) => ({ group: FAQ_GROUP, label: r.question, value: r.answer }))]);
  return (
    <div className={styles.subBlock} data-area="faqs">
      <h3 className={styles.subTitle}>Questions and answers</h3>
      <p className={styles.hint}>Answer what buyers keep asking, such as delivery, fitting, sizes or what is needed to use it. Shown under the item as a tap-to-open list.</p>
      <RowList
        noun={{ key: "faq", label: "Question", name: "question" }} rows={rows} max={max} onChange={write} focusOn={focusOn}
        blank={{ question: "", answer: "" }} focusFirst={(n) => `faq-${n}-question`} addLabel="Add question" addKey="add-faq" icon={faCircleQuestion}
        empty={{ title: "No questions yet", body: "Add up to 15, like \"Does it come with a charger?\" or \"Do you deliver outside town?\"." }}
        renderRow={(r, i, edit) => (
          <>
            <Field name={`faq-${i}-question`} label="Question" area="faqs" max={FAQ_LIMITS.question} value={r.question} onChange={(e) => edit((x) => ({ ...x, question: e.target.value }))} />
            <Field name={`faq-${i}-answer`} as="textarea" label="Answer" area="faqs" max={FAQ_LIMITS.answer} value={r.answer} onChange={(e) => edit((x) => ({ ...x, answer: e.target.value }))} />
          </>
        )}
      />
    </div>
  );
}
