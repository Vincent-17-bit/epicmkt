import { useId } from "react";
import { SPEC_LIMITS, rowChoices } from "@epicmkt/shared";
import { ColorValueInput, OpenValueInput, useOpenValueSource } from "../../../../components/values";
import { Field } from "./parts.jsx";
import { LEVEL_TEXT, ownValue, valueKindOf, valueOf, withRow, withValue } from "./typedRows.js";
import styles from "./editor.module.css";

function YesNo({ row, label, value, onChange }) {
  const uid = useId();
  return (
    <fieldset className={styles.field} data-area="specs" data-focus={`row-${row.key}`} tabIndex={-1}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.yesNo}>
        {["Yes", "No"].map((answer) => (
          <label key={answer}>
            <input type="radio" name={`${uid}-${row.key}`} checked={value === answer} onChange={() => onChange(answer)} /> {answer}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OpenRow({ row, kind, label, form, patch, source }) {
  const found = useOpenValueSource();
  const common = { label, source: source ?? found, value: valueOf(form, row), onChange: (v) => { const next = withValue(form, row, v); patch("specs", next.specs); patch("specValues", next.specValues); } };
  return kind === "color" ? <ColorValueInput {...common} /> : <OpenValueInput {...common} kind={kind} />;
}

function Row({ row, form, patch, source }) {
  const label = `${row.label} (${LEVEL_TEXT[row.level]})`;
  const value = ownValue(form, row);
  const set = (next) => patch("specs", withRow(form, row, next));
  const common = { name: `row-${row.key}`, label, area: "specs", value, onChange: (e) => set(e.target.value) };
  if (row.input === "boolean") return <YesNo row={row} label={label} value={value} onChange={set} />;
  if (row.input === "choice") {
    const choices = rowChoices(row) ?? [];
    const extra = value && !choices.includes(value) ? [value] : [];
    return (
      <Field {...common} as="select">
        <option value="">Choose one</option>
        {[...choices, ...extra].map((c) => <option key={c} value={c}>{c}</option>)}
      </Field>
    );
  }
  if (row.input === "number") return <Field {...common} max={SPEC_LIMITS.value} inputMode="decimal" autoComplete="off" />;
  const kind = row.input === "openValue" ? valueKindOf(row) : null;
  if (kind) return <OpenRow row={row} kind={kind} label={label} form={form} patch={patch} source={source} />;
  // TODO(contract:1.5) dimension: dimension editor
  return <Field {...common} max={SPEC_LIMITS.value} autoComplete="off" />;
}

export default function TypeRows({ rows, form, patch, source }) {
  return (
    <div className={styles.grid}>
      {rows.map((row) => <Row key={row.key} row={row} form={form} patch={patch} source={source} />)}
    </div>
  );
}
