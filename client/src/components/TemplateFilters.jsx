import { useEffect, useState } from "react";
import { buildRange, parseRange } from "@epicmkt/shared";
import Toggle from "./Toggle.jsx";
import styles from "./FilterPanel.module.css";

function RangeFilter({ field, id, value, onChange }) {
  const parsed = parseRange(value);
  const [range, setRange] = useState({ min: parsed.min ?? "", max: parsed.max ?? "" });

  useEffect(() => {
    const next = parseRange(value);
    setRange({ min: next.min ?? "", max: next.max ?? "" });
  }, [value]);

  const commit = () => {
    let { min, max } = range;
    if (min !== "" && max !== "" && Number(min) > Number(max)) [min, max] = [max, min];
    const next = buildRange(min, max);
    if (next !== (value ?? "")) onChange(next);
  };

  return (
    <fieldset className={styles.sub}>
      <legend className={styles.subLabel}>
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
      </legend>
      <div className={styles.range}>
        <label htmlFor={`${id}-min`} className={styles.srOnly}>
          {field.label}, minimum
        </label>
        <input
          id={`${id}-min`}
          className={styles.input}
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Min"
          value={range.min}
          onChange={(e) => setRange((r) => ({ ...r, min: e.target.value }))}
          onBlur={commit}
        />
        <span aria-hidden="true">–</span>
        <label htmlFor={`${id}-max`} className={styles.srOnly}>
          {field.label}, maximum
        </label>
        <input
          id={`${id}-max`}
          className={styles.input}
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="Max"
          value={range.max}
          onChange={(e) => setRange((r) => ({ ...r, max: e.target.value }))}
          onBlur={commit}
        />
      </div>
    </fieldset>
  );
}

function FieldFilter({ field, id, value, onChange }) {
  if (field.type === "boolean") {
    return (
      <Toggle checked={value === "true"} onChange={(on) => onChange(on ? "true" : "")}>
        {field.label}
      </Toggle>
    );
  }

  if (field.type === "select") {
    return (
      <div className={styles.sub}>
        <label htmlFor={id} className={styles.subLabel}>
          {field.label}
        </label>
        <select id={id} className={styles.select} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Any</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "multiselect") {
    const selected = String(value ?? "").split(",").filter(Boolean);
    const toggle = (option, on) => {
      const next = on ? [...selected, option] : selected.filter((v) => v !== option);
      onChange(field.options.map((o) => o.value).filter((v) => next.includes(v)).join(","));
    };
    return (
      <fieldset className={styles.sub}>
        <legend className={styles.subLabel}>{field.label}</legend>
        {field.options.map((o) => (
          <Toggle key={o.value} checked={selected.includes(o.value)} onChange={(on) => toggle(o.value, on)}>
            {o.label}
          </Toggle>
        ))}
      </fieldset>
    );
  }

  return <RangeFilter field={field} id={id} value={value} onChange={onChange} />;
}

export default function TemplateFilters({ title, fields, attrs, idPrefix, onChange }) {
  if (!fields?.length) return null;
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{title}</legend>
      {fields.map((field) => (
        <FieldFilter
          key={field.key}
          field={field}
          id={`${idPrefix}-${field.key}`}
          value={attrs[field.key]}
          onChange={(value) => onChange({ attrs: { [field.key]: value } })}
        />
      ))}
    </fieldset>
  );
}
