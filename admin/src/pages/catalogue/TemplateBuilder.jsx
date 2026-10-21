import Button from "../../components/Button.jsx";
import { FIELD_TYPES, docKeyFromLabel, keyFromLabel, move, parseOptions, removeField } from "../../lib/catalogue.js";

const hasOptions = (t) => t === "select" || t === "multiselect";

/** Edits the list of extra questions a category asks. `problems` is templateProblems() output, by index. */
export function QuestionsEditor({ fields, onChange, problems }) {
  const set = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const add = () => onChange([...fields, { key: keyFromLabel("question", fields.map((f) => f.key)), label: "", type: "text", _fresh: true }]);
  return (
    <fieldset className="builder">
      <legend>Questions on the application</legend>
      {fields.length === 0 && <p className="muted">No extra questions. Sellers answer only the standard ones.</p>}
      {fields.map((f, i) => (
        <div className="builder__item" key={i}>
          <div className="builder__row">
            <label className="field">Question
              <input value={f.label} maxLength={80} placeholder="For example: Delivery available"
                onChange={(e) => set(i, { label: e.target.value, ...(f._fresh ? { key: keyFromLabel(e.target.value, fields.filter((_, j) => j !== i).map((x) => x.key)) } : {}) })} />
            </label>
            <label className="field">Answer type
              <select value={f.type} onChange={(e) => set(i, { type: e.target.value })}>{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
          </div>
          {hasOptions(f.type) && (
            <label className="field">Choices (one per line)
              <textarea rows={3} value={(f._optionsText ?? (f.options ?? []).join("\n"))}
                onChange={(e) => set(i, { _optionsText: e.target.value, options: parseOptions(e.target.value) })} />
            </label>
          )}
          <div className="builder__row builder__flags">
            <label><input type="checkbox" checked={!!f.required} onChange={(e) => set(i, { required: e.target.checked })} /> Required</label>
            <label><input type="checkbox" checked={!!f.filterable} onChange={(e) => set(i, { filterable: e.target.checked })} /> Customers can filter by it</label>
            <label><input type="checkbox" checked={!!f.showOnCard} onChange={(e) => set(i, { showOnCard: e.target.checked })} /> Show on the listing card</label>
          </div>
          <div className="builder__row">
            <label className="field">Only ask when
              <select value={f.showIf?.field ?? ""} onChange={(e) => set(i, { showIf: e.target.value ? { field: e.target.value, equals: true } : undefined })}>
                <option value="">Always ask</option>
                {fields.filter((x, j) => j !== i && x.type === "boolean").map((x) => <option key={x.key} value={x.key}>{x.label || x.key} is yes</option>)}
              </select>
            </label>
            <div className="builder__tools">
              <Button size="sm" disabled={i === 0} onClick={() => onChange(move(fields, i, i - 1))} aria-label={`Move question ${i + 1} up`}>Up</Button>
              <Button size="sm" disabled={i === fields.length - 1} onClick={() => onChange(move(fields, i, i + 1))} aria-label={`Move question ${i + 1} down`}>Down</Button>
              <Button size="sm" onClick={() => onChange(removeField(fields, i))} aria-label={`Remove question ${i + 1}`}>Remove</Button>
            </div>
          </div>
          {(problems[i] ?? []).map((p) => <p key={p} className="modal__error">{p}</p>)}
        </div>
      ))}
      <Button size="sm" onClick={add}>Add a question</Button>
    </fieldset>
  );
}

/** Edits the extra documents a category requires. */
export function DocsEditor({ docs, onChange, problems }) {
  const set = (i, patch) => onChange(docs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = () => onChange([...docs, { key: docKeyFromLabel("document", docs.map((d) => d.key)), label: "", rule: "required", why: "", _fresh: true }]);
  return (
    <fieldset className="builder">
      <legend>Extra documents</legend>
      {docs.length === 0 && <p className="muted">No extra documents beyond the standard ones.</p>}
      {docs.map((d, i) => (
        <div className="builder__item" key={i}>
          <div className="builder__row">
            <label className="field">Document
              <input value={d.label} maxLength={120} placeholder="For example: EPRA licence"
                onChange={(e) => set(i, { label: e.target.value, ...(d._fresh ? { key: docKeyFromLabel(e.target.value, docs.filter((_, j) => j !== i).map((x) => x.key)) } : {}) })} />
            </label>
            <label className="field">Needed
              <select value={d.rule} onChange={(e) => set(i, { rule: e.target.value })}><option value="required">Always</option><option value="conditional">Only in some cases</option></select>
            </label>
          </div>
          {d.rule === "conditional" && (
            <label className="field">Applicant ticks this when
              <input value={d.condition ?? ""} maxLength={160} placeholder="I carry a KEBS mark" onChange={(e) => set(i, { condition: e.target.value })} />
            </label>
          )}
          <label className="field">Why we ask (applicants see this)
            <input value={d.why} maxLength={200} onChange={(e) => set(i, { why: e.target.value })} />
          </label>
          <Button size="sm" onClick={() => onChange(docs.filter((_, j) => j !== i))} aria-label={`Remove document ${i + 1}`}>Remove</Button>
          {(problems[i] ?? []).map((p) => <p key={p} className="modal__error">{p}</p>)}
        </div>
      ))}
      <Button size="sm" onClick={add}>Add a document</Button>
    </fieldset>
  );
}
