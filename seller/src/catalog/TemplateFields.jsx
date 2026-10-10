import { visibleFields } from "@epicmkt/shared";
import { Field, TextInput, TextArea, NumberInput, SelectInput, CheckRow, RowList } from "../ui/ui.jsx";
import styles from "./catalog.module.css";

const isBlank = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

// Drops values that are empty, and values for fields hidden by a showIf rule (repeats until nothing more changes).
export function pruneAttributes(fields, values) {
  let next = Object.fromEntries(Object.entries(values).filter(([, v]) => !isBlank(v)));
  for (let pass = 0; pass < 4; pass += 1) {
    const shown = new Set(visibleFields(fields, next).map((f) => f.key));
    const kept = Object.fromEntries(Object.entries(next).filter(([k]) => shown.has(k) || !fields.some((f) => f.key === k)));
    if (Object.keys(kept).length === Object.keys(next).length) return kept;
    next = kept;
  }
  return next;
}

function Tags({ field }) {
  return (
    <span className={styles.fieldTags}>
      {field.filterable && <span className={styles.fieldTag}>Filter</span>}
      {field.showOnCard && <span className={styles.fieldTag}>On listing card</span>}
    </span>
  );
}

const withUnit = (field) => (field.unit ? `${field.label} (${field.unit})` : field.label);

function Control({ field, value, onChange, error }) {
  switch (field.type) {
    case "text":
      return <Field label={<>{field.label}<Tags field={field} /></>} error={error} count={(value ?? "").length} max={200} optional={!field.required}>{(p) => <TextInput {...p} value={value} maxLength={200} onChange={onChange} data-nav />}</Field>;
    case "longtext":
      return <Field label={<>{field.label}<Tags field={field} /></>} error={error} count={(value ?? "").length} max={1000} optional={!field.required}>{(p) => <TextArea {...p} value={value} maxLength={1000} onChange={onChange} />}</Field>;
    case "number":
    case "price":
      return (
        <Field label={<>{field.type === "price" ? `${withUnit(field)} (KSh)` : withUnit(field)}<Tags field={field} /></>} error={error} optional={!field.required}>
          {(p) => <NumberInput {...p} value={value} onChange={onChange} data-nav />}
        </Field>
      );
    case "boolean":
      return (
        <div>
          <CheckRow checked={value === true} onChange={(v) => onChange(v ? true : false)} label={<>{field.label}<Tags field={field} /></>} />
          {error && <span role="alert" className={styles.errorText}>{error}</span>}
        </div>
      );
    case "select":
      return <Field label={<>{field.label}<Tags field={field} /></>} error={error} optional={!field.required}>{(p) => <SelectInput {...p} value={value} onChange={onChange} options={field.options} placeholder="Not set" data-nav />}</Field>;
    case "multiselect": {
      const chosen = Array.isArray(value) ? value : [];
      return (
        <fieldset className={styles.group} aria-invalid={error ? true : undefined}>
          <legend>{field.label}<Tags field={field} /></legend>
          <div className={styles.checkGrid}>
            {field.options.map((o) => (
              <CheckRow key={o.value} checked={chosen.includes(o.value)} label={o.label} onChange={(on) => onChange(field.options.map((x) => x.value).filter((v) => (v === o.value ? on : chosen.includes(v))))} />
            ))}
          </div>
          {error && <span role="alert" className={styles.errorText}>{error}</span>}
        </fieldset>
      );
    }
    case "timerange": {
      const [from = "", to = ""] = Array.isArray(value) ? value : [];
      const set = (a, b) => onChange(a || b ? [a, b] : undefined);
      return (
        <fieldset className={styles.group} aria-invalid={error ? true : undefined}>
          <legend>{field.label}<Tags field={field} /></legend>
          <div className={styles.twoCol}>
            <Field label="From" error={error}>{(p) => <input {...p} className={styles.timeInput} type="time" value={from} onChange={(e) => set(e.target.value, to)} data-nav />}</Field>
            <Field label="To">{(p) => <input {...p} className={styles.timeInput} type="time" value={to} onChange={(e) => set(from, e.target.value)} data-nav />}</Field>
          </div>
        </fieldset>
      );
    }
    case "url":
      return <Field label={<>{field.label}<Tags field={field} /></>} error={error} hint="Starts with https://" optional={!field.required}>{(p) => <TextInput {...p} type="url" inputMode="url" value={value} onChange={onChange} data-nav />}</Field>;
    case "image":
      return <Field label={field.label} error={error} hint="Paste an image link. Uploading photos arrives with the photos step." optional={!field.required}>{(p) => <TextInput {...p} type="url" inputMode="url" value={value} onChange={onChange} data-nav />}</Field>;
    case "itemlist":
      return (
        <fieldset className={styles.group} aria-invalid={error ? true : undefined}>
          <legend>{field.label}</legend>
          <RowList
            items={Array.isArray(value) ? value : []}
            onChange={onChange}
            blank={() => ({ name: "", price: null })}
            addLabel="Add a line"
            label={field.label}
            max={50}
            renderRow={(it, patch) => (
              <>
                <TextInput value={it.name} aria-label="Name" placeholder="Name" maxLength={80} onChange={(name) => patch({ name })} data-nav />
                <NumberInput value={it.price} aria-label="Price (KSh)" placeholder="Price" onChange={(price) => patch({ price })} data-nav />
              </>
            )}
          />
          {error && <span role="alert" className={styles.errorText}>{error}</span>}
        </fieldset>
      );
    default:
      return null;
  }
}

// Renders any category template generically: every field type, showIf, groups, filterable and showOnCard flags.
export function TemplateFields({ fields, values, onChange, errors = {} }) {
  const shown = visibleFields(fields, values);
  const groups = [];
  for (const f of shown) {
    const name = f.group ?? "Details";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, fields: [] }));
    g.fields.push(f);
  }
  const set = (key, v) => onChange(pruneAttributes(fields, { ...values, [key]: v }));
  return (
    <div className={styles.templateGroups}>
      {groups.map((g) => (
        <section key={g.name} aria-label={g.name}>
          <h4 className={styles.groupTitle}>{g.name}</h4>
          <div className={styles.templateGrid}>
            {g.fields.map((f) => (
              <div key={f.key} className={f.type === "longtext" || f.type === "multiselect" || f.type === "itemlist" || f.type === "timerange" ? styles.wide : undefined}>
                <Control field={f} value={values[f.key]} error={errors[`attributes.${f.key}`]} onChange={(v) => set(f.key, v)} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
