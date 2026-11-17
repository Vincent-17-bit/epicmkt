import { useState } from "react";
import { INFO_TEMPLATES, SPEC_LIMITS, infoGroupKey, infoTemplateById, infoTemplateOf, infoValueRaw, infoValueText, isInfoGroup } from "@epicmkt/shared";
import { CheckRow, Field } from "./parts.jsx";
import styles from "./editor.module.css";

const sameLabel = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export default function ProductInfoEditor({ specs, onChange, plainCount }) {
  const found = infoTemplateOf(specs);
  const [picked, setPicked] = useState(found?.id ?? "");
  const template = infoTemplateById(picked);
  const room = SPEC_LIMITS.rows - plainCount;
  const infoCount = specs.filter((s) => isInfoGroup(s.group)).length;

  const valueOf = (group, row) => {
    const hit = specs.find((s) => s.group === infoGroupKey(group.name) && sameLabel(s.label, row.label));
    return hit ? infoValueRaw(row, hit.value) : "";
  };

  const setValue = (group, row, raw) => {
    const key = infoGroupKey(group.name);
    const rest = specs.filter((s) => !(s.group === key && sameLabel(s.label, row.label)));
    const text = infoValueText(row, raw);
    onChange(text ? [...rest, { group: key, label: row.label, value: text.slice(0, SPEC_LIMITS.value) }] : rest);
  };

  const choose = (id) => {
    setPicked(id);
    if (!id) onChange(specs.filter((s) => !isInfoGroup(s.group)));
  };

  const control = (group, row) => {
    const raw = valueOf(group, row);
    const name = `info-${group.name}-${row.key}`;
    if (row.input === "multi") {
      const chosen = raw ? raw.split(", ") : [];
      return (
        <fieldset key={row.key} className={styles.infoMulti}>
          <legend className={styles.label}>{row.label}</legend>
          <div className={styles.infoChecks}>
            {row.choices.map((c) => (
              <CheckRow key={c} checked={chosen.includes(c)} onChange={(e) => setValue(group, row, (e.target.checked ? [...chosen, c] : chosen.filter((x) => x !== c)).join(", "))}>{c}</CheckRow>
            ))}
          </div>
        </fieldset>
      );
    }
    if (row.input === "choice" || row.input === "boolean") {
      const options = row.input === "boolean" ? ["Yes", "No"] : row.choices;
      return (
        <Field key={row.key} name={name} as="select" label={row.label} value={raw} onChange={(e) => setValue(group, row, e.target.value)}>
          <option value="">Not stated</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </Field>
      );
    }
    return (
      <Field
        key={row.key}
        name={name}
        label={row.unit ? `${row.label} (${row.unit})` : row.label}
        value={raw}
        inputMode={row.input === "number" ? "decimal" : undefined}
        placeholder={row.placeholder}
        max={row.unit ? 20 : SPEC_LIMITS.value}
        onChange={(e) => setValue(group, row, e.target.value)}
        autoComplete="off"
      />
    );
  };

  return (
    <div className={styles.subBlock} data-area="productinfo">
      <h3 className={styles.subTitle}>Product information</h3>
      <p className={styles.hint}>A full spec sheet shown as a grouped table at the bottom of the item page. Fill what applies and leave the rest.</p>
      <Field name="info-template" as="select" label="Product kind" value={picked} onChange={(e) => choose(e.target.value)}>
        <option value="">None</option>
        {INFO_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Field>
      {template && (
        <>
          <p className={styles.hint}>{infoCount} filled. {room < infoCount ? "Too many rows: remove some." : `Room for ${Math.max(0, room - infoCount)} more.`}</p>
          {template.groups.map((group) => (
            <details key={group.name} className={styles.infoGroup}>
              <summary className={styles.infoSummary}>{group.name}</summary>
              <div className={styles.infoGrid}>{group.rows.map((row) => control(group, row))}</div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}
