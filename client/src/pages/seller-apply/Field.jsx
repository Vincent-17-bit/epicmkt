import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Controller, get, useFormContext, useWatch } from "react-hook-form";
import styles from "./form.module.css";

export const fieldId = (name) => `f-${name.replace(/\./g, "-")}`;

export function ErrorLine({ id, message }) {
  if (!message) return null;
  return (
    <p id={id} className={styles.error}>
      <FontAwesomeIcon icon={faCircleExclamation} />
      <span>{message}</span>
    </p>
  );
}

export function Field({ name, label, hint, optional, className = "", aside, children }) {
  const {
    formState: { errors }
  } = useFormContext();
  const error = get(errors, name)?.message;
  const id = fieldId(name);
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`${styles.field} ${className}`} data-invalid={error ? "true" : undefined}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={id} className={styles.label}>
            {label}
            {optional && <span className={styles.optional}> (optional)</span>}
          </label>
          {aside}
        </div>
      )}
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && (
        <p id={`${id}-hint`} className={error ? styles.srOnly : styles.hint}>
          {hint}
        </p>
      )}
      {error && <ErrorLine id={`${id}-err`} message={error} />}
    </div>
  );
}

function Counter({ name, max }) {
  const { control } = useFormContext();
  const value = useWatch({ control, name }) ?? "";
  const near = String(value).length >= max * 0.9;
  return (
    <span className={styles.counter} data-near={near ? "true" : undefined} aria-hidden="true">
      {String(value).length}/{max}
    </span>
  );
}

export function TextField({ name, label, hint, optional, type = "text", counter, className, ...input }) {
  const { register } = useFormContext();
  return (
    <Field
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      className={className}
      aside={counter && input.maxLength ? <Counter name={name} max={input.maxLength} /> : null}
    >
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

/**
 * A text box that cleans what is typed (`mask`) and tidies it when the person leaves the box (`tidy`).
 * Used for ID numbers, phone numbers and the KRA PIN, where a wrong key press should never get in.
 */
export function MaskedField({ name, label, hint, optional, className, mask, tidy, ...input }) {
  const { control } = useFormContext();
  return (
    <Field name={name} label={label} hint={hint} optional={optional} className={className}>
      {(aria) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <input
              className={styles.input}
              {...aria}
              {...input}
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onChange={(e) => field.onChange(mask ? mask(e.target.value) : e.target.value)}
              onBlur={() => {
                if (tidy) field.onChange(tidy(field.value));
                field.onBlur();
              }}
            />
          )}
        />
      )}
    </Field>
  );
}

export function SelectField({ name, label, hint, optional, options, placeholder = "Choose", className, ...rest }) {
  const { register } = useFormContext();
  return (
    <Field name={name} label={label} hint={hint} optional={optional} className={className}>
      {(aria) => (
        <select className={`${styles.input} ${styles.select}`} {...aria} {...register(name)} {...rest}>
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
