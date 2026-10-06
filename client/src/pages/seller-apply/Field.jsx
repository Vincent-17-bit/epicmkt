import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import { get, useFormContext } from "react-hook-form";
import styles from "./form.module.css";

export const fieldId = (name) => `f-${name.replace(/\./g, "-")}`;

export function Field({ name, label, hint, optional, className = "", children }) {
  const {
    formState: { errors }
  } = useFormContext();
  const error = get(errors, name)?.message;
  const id = fieldId(name);
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {optional && <span className={styles.optional}> (optional)</span>}
        </label>
      )}
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {error && (
        <p id={`${id}-err`} className={styles.error}>
          <FontAwesomeIcon icon={faCircleExclamation} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function TextField({ name, label, hint, optional, type = "text", options, className, ...input }) {
  const { register } = useFormContext();
  return (
    <Field name={name} label={label} hint={hint} optional={optional} className={className}>
      {(aria) =>
        type === "textarea" ? (
          <textarea className={styles.input} rows={3} {...aria} {...register(name)} {...input} />
        ) : (
          <input className={styles.input} type={type} {...aria} {...register(name)} {...input} />
        )
      }
    </Field>
  );
}

export function SelectField({ name, label, hint, optional, options, placeholder = "Choose", className }) {
  const { register } = useFormContext();
  return (
    <Field name={name} label={label} hint={hint} optional={optional} className={className}>
      {(aria) => (
        <select className={styles.input} {...aria} {...register(name)}>
          <option value="">{placeholder}</option>
          {options.map((o) => {
            const [value, text] = Array.isArray(o) ? o : [o, o];
            return (
              <option key={value} value={value}>
                {text}
              </option>
            );
          })}
        </select>
      )}
    </Field>
  );
}

export function ErrorLine({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.error}>
      <FontAwesomeIcon icon={faCircleExclamation} />
      <span>{message}</span>
    </p>
  );
}
