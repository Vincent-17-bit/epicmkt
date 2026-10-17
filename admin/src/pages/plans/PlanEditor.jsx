import { BADGES } from "./schema.js";

const PLAN_LABEL = { standard: "Standard", premium: "Premium" };

function Field({ id, label, error, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="field__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default function PlanEditor({ planKey, value, errors, onChange, disabled }) {
  const p = (name) => (errors[`${planKey}.${name}`] ? { "aria-invalid": true, "aria-describedby": `${planKey}-${name}-error` } : {});
  const set = (patch) => onChange({ ...value, ...patch });
  const err = (name) => errors[`${planKey}.${name}`];
  return (
    <fieldset className="plan-editor" disabled={disabled}>
      <legend>{PLAN_LABEL[planKey]}</legend>
      <div className="plan-editor__row">
        <Field id={`${planKey}-price`} label="Price per month (KES)" error={err("price")}>
          <input id={`${planKey}-price`} inputMode="numeric" value={value.price} onChange={(e) => set({ price: e.target.value })} {...p("price")} />
        </Field>
        <Field id={`${planKey}-items`} label="Item limit" error={err("items")}>
          <input id={`${planKey}-items`} inputMode="numeric" value={value.items} onChange={(e) => set({ items: e.target.value })} {...p("items")} />
        </Field>
        <Field id={`${planKey}-trialDays`} label="Free trial days" error={err("trialDays")}>
          <input id={`${planKey}-trialDays`} inputMode="numeric" value={value.trialDays} onChange={(e) => set({ trialDays: e.target.value })} {...p("trialDays")} />
        </Field>
        <Field id={`${planKey}-badge`} label="Badge" error={err("badge")}>
          <select id={`${planKey}-badge`} value={value.badge ?? ""} onChange={(e) => set({ badge: e.target.value || null })}>
            <option value="">None</option>
            {BADGES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {[0, 1, 2].map((i) => (
        <Field key={i} id={`${planKey}-benefit-${i}`} label={`Top benefit ${i + 1}`} error={err(`topBenefits.${i}`)}>
          <input
            id={`${planKey}-benefit-${i}`}
            value={value.topBenefits[i] ?? ""}
            maxLength={120}
            onChange={(e) => set({ topBenefits: value.topBenefits.map((t, j) => (j === i ? e.target.value : t)) })}
            {...p(`topBenefits.${i}`)}
          />
          <span className="field__hint">{(value.topBenefits[i] ?? "").trim().length}/80</span>
        </Field>
      ))}
    </fieldset>
  );
}
