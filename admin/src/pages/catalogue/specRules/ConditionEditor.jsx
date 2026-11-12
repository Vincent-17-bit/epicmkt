import { OPS, blankLeaf } from "../../../lib/specRules.js";
import Button from "../../../components/Button.jsx";

export default function ConditionEditor({ legend, value, rows, ownKey, onChange, disabled }) {
  const others = rows.filter((r) => r.key !== ownKey && r.label.trim());
  const patch = (next) => onChange(next.leaves.length === 0 ? null : next);

  if (value?.raw) {
    return (
      <div className="sr-cond" role="group" aria-label={legend}>
        <span className="muted">{legend}: a custom rule, kept as it is.</span>
        <Button type="button" onClick={() => onChange(null)} disabled={disabled}>Remove rule</Button>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="sr-cond">
        <span>{legend}: never</span>
        <Button type="button" onClick={() => onChange({ join: "all", leaves: [blankLeaf(others[0]?.key)] })} disabled={disabled || others.length === 0} aria-label={`Add rule: ${legend}`}>Add rule</Button>
      </div>
    );
  }
  const setLeaf = (i, p) => patch({ ...value, leaves: value.leaves.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  return (
    <fieldset className="sr-cond" disabled={disabled}>
      <legend>{legend}</legend>
      {value.leaves.length > 1 && (
        <label className="field">Match
          <select value={value.join} onChange={(e) => patch({ ...value, join: e.target.value })}>
            <option value="all">All of these</option>
            <option value="any">Any of these</option>
          </select>
        </label>
      )}
      {value.leaves.map((l, i) => (
        <div key={i} className="sc-row">
          <label className="field">Row
            <select value={l.row} onChange={(e) => setLeaf(i, { row: e.target.value })}>
              {others.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label className="field">Test
            <select value={l.op} onChange={(e) => setLeaf(i, { op: e.target.value, value: e.target.value === "present" ? "yes" : "" })}>
              {OPS.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>
          </label>
          {l.op === "present" ? (
            <label className="field">Value
              <select value={l.value || "yes"} onChange={(e) => setLeaf(i, { value: e.target.value })}>
                <option value="yes">Filled in</option>
                <option value="no">Empty</option>
              </select>
            </label>
          ) : (
            <label className="field">{l.op === "in" ? "Values, comma separated" : l.op === "tag" ? "Tag" : "Value"}
              <input value={l.value} onChange={(e) => setLeaf(i, { value: e.target.value })} />
            </label>
          )}
          <Button type="button" onClick={() => patch({ ...value, leaves: value.leaves.filter((_, j) => j !== i) })} aria-label={`Remove condition ${i + 1} of ${legend}`}>Remove</Button>
        </div>
      ))}
      <div className="sc-actions">
        <Button type="button" onClick={() => patch({ ...value, leaves: [...value.leaves, blankLeaf(others[0]?.key)] })} disabled={others.length === 0}>Add condition</Button>
      </div>
    </fieldset>
  );
}
