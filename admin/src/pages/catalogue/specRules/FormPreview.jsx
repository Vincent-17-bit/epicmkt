import { useId, useMemo, useState } from "react";
import { rowChoices } from "@epicmkt/shared";
import { previewOf, tagRows } from "../../../lib/specRules.js";

const WORD = { required: "Required", recommended: "Recommended", optional: "Optional" };

function Answer({ row, id, value, onChange }) {
  const choices = row.input === "choice" ? rowChoices(row) : row.input === "boolean" ? ["Yes", "No"] : null;
  if (choices) {
    return (
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose</option>
        {choices.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }
  return <input id={id} type={row.input === "number" ? "number" : "text"} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

export default function FormPreview({ rows }) {
  const uid = useId();
  const [answers, setAnswers] = useState({});
  const [tags, setTags] = useState({});
  const tagged = useMemo(() => tagRows(rows), [rows]);
  const out = useMemo(() => previewOf(rows, answers, tags), [rows, answers, tags]);

  return (
    <section className="sc-card" aria-label="Seller form preview" data-testid="spec-preview">
      <h3 className="heading-sm">What the seller sees</h3>
      <p className="muted">Fill in the sample to see which rows appear and which become required.</p>
      {out.shown.length === 0 && <p className="muted">This type has no rows.</p>}
      {out.shown.map((r) => (
        <div key={r.key} className="field">
          <label htmlFor={`${uid}-${r.key}`}>{r.label} <span className="sr-badge">({WORD[r.level]})</span></label>
          <Answer row={r} id={`${uid}-${r.key}`} value={answers[r.key]} onChange={(v) => setAnswers({ ...answers, [r.key]: v })} />
          {tagged.has(r.key) && (
            <label className="field">Sample tags of this value, comma separated
              <input value={tags[r.key] ?? ""} onChange={(e) => setTags({ ...tags, [r.key]: e.target.value })} />
            </label>
          )}
        </div>
      ))}
      <div role="status" aria-live="polite">
        {out.invalid
          ? <p className="muted">Fix the errors on the left to see the result.</p>
          : out.blockers.length > 0
          ? <><p className="sc-note">Cannot publish yet:</p><ul>{out.blockers.map((b) => <li key={b.key}>{b.message}</li>)}</ul></>
          : <p>Ready to publish.</p>}
        {!out.invalid && <p className="muted">Quality score {out.score}%</p>}
      </div>
    </section>
  );
}
