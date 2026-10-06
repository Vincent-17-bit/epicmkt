import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Field } from "./Field.jsx";
import { fieldVisible } from "./formModel.js";
import form from "./form.module.css";
import styles from "./steps.module.css";

const num = (v) => (v === "" || v === null || v === undefined ? undefined : Number(v));

function Control({ field, name, aria }) {
  const { register, control } = useFormContext();
  switch (field.type) {
    case "longtext":
      return <textarea className={form.input} rows={3} {...aria} {...register(name)} />;
    case "number":
    case "price":
      return (
        <div className={styles.priceWrap}>
          {field.type === "price" && <span className={styles.prefix}>KES</span>}
          <input
            className={form.input}
            type="number"
            min="0"
            inputMode="decimal"
            {...aria}
            {...register(name, { setValueAs: num })}
          />
        </div>
      );
    case "url":
      return <input className={form.input} type="url" inputMode="url" {...aria} {...register(name)} />;
    case "boolean":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => (
            <div className={form.choices} role="radiogroup" aria-label={field.label} {...aria}>
              {[
                [true, "Yes"],
                [false, "No"]
              ].map(([v, label]) => (
                <label key={label} className={form.choice}>
                  <input type="radio" name={name} checked={f.value === v} onChange={() => f.onChange(v)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        />
      );
    case "select":
      return (
        <select className={form.input} {...aria} {...register(name)}>
          <option value="">Choose</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "multiselect":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => {
            const current = Array.isArray(f.value) ? f.value : [];
            const toggle = (o) => f.onChange(current.includes(o) ? current.filter((x) => x !== o) : [...current, o]);
            return (
              <div className={form.choices} role="group" aria-label={field.label} {...aria}>
                {field.options.map((o) => (
                  <label key={o} className={form.choice}>
                    <input type="checkbox" checked={current.includes(o)} onChange={() => toggle(o)} />
                    {o}
                  </label>
                ))}
              </div>
            );
          }}
        />
      );
    case "timerange":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => {
            const v = f.value ?? {};
            return (
              <div className={styles.range} role="group" aria-label={field.label} {...aria}>
                <input className={form.input} type="time" aria-label={`${field.label} from`} value={v.from ?? ""} onChange={(e) => f.onChange({ ...v, from: e.target.value })} />
                <span>to</span>
                <input className={form.input} type="time" aria-label={`${field.label} to`} value={v.to ?? ""} onChange={(e) => f.onChange({ ...v, to: e.target.value })} />
              </div>
            );
          }}
        />
      );
    case "itemlist":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field: f }) => {
            const items = Array.isArray(f.value) && f.value.length ? f.value : [""];
            const set = (i, val) => f.onChange(items.map((x, k) => (k === i ? val : x)));
            return (
              <div className={styles.list} role="group" aria-label={field.label} {...aria}>
                {items.map((item, i) => (
                  <div key={i} className={styles.listRow}>
                    <input
                      className={form.input}
                      aria-label={`${field.label} ${i + 1}`}
                      value={item}
                      onChange={(e) => set(i, e.target.value)}
                    />
                    {items.length > 1 && (
                      <button type="button" className={styles.iconBtn} aria-label={`Remove ${field.label} ${i + 1}`} onClick={() => f.onChange(items.filter((_, k) => k !== i))}>
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    )}
                  </div>
                ))}
                {items.length < 20 && (
                  <button type="button" className={styles.addBtn} onClick={() => f.onChange([...items, ""])}>
                    <FontAwesomeIcon icon={faPlus} /> Add another
                  </button>
                )}
              </div>
            );
          }}
        />
      );
    case "image":
      return <p className={styles.note}>You can add photos to your listing after approval.</p>;
    default:
      return <input className={form.input} type="text" {...aria} {...register(name)} />;
  }
}

export default function TemplateFields({ fields }) {
  const { control } = useFormContext();
  const values = useWatch({ control, name: "templateValues" }) ?? {};
  return (
    <div className={form.grid}>
      {fields
        .filter((f) => fieldVisible(f, values))
        .map((f) => (
          <Field
            key={f.key}
            name={`templateValues.${f.key}`}
            label={f.label}
            optional={!f.required}
            className={["multiselect", "itemlist", "boolean"].includes(f.type) ? form.span2 : ""}
          >
            {(aria) => <Control field={f} name={`templateValues.${f.key}`} aria={aria} />}
          </Field>
        ))}
    </div>
  );
}
