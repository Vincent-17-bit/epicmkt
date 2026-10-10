import { cloneElement, useId, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faCrown } from "@fortawesome/free-solid-svg-icons";

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }) : null;

export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-KE", { dateStyle: "medium", timeZone: "Africa/Nairobi" }) : null);

export const kes = (n) => `KES ${Number(n).toLocaleString("en-KE")}`;

export function Chip({ tone = "neutral", children, icon }) {
  return (
    <span className={`sx-chip sx-chip--${tone}`}>
      {icon && <FontAwesomeIcon icon={icon} aria-hidden="true" />}
      {children}
    </span>
  );
}

export const LockChip = () => <Chip tone="lock" icon={faLock}>Changes need approval</Chip>;
export const PremiumChip = () => <Chip tone="premium" icon={faCrown}>Premium</Chip>;

/** Label + one input. The input gets the id, error state and description wired up. */
export function Field({ label, hint, error, counter, children }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`sx-field${error ? " sx-field--bad" : ""}`}>
      <div className="sx-field__top">
        <label htmlFor={id}>{label}</label>
        {counter}
      </div>
      {cloneElement(children, { id, "aria-invalid": error ? "true" : undefined, "aria-describedby": describedBy })}
      {hint && <p id={`${id}-hint`} className="sx-hint">{hint}</p>}
      {error && <p id={`${id}-err`} className="sx-error" role="alert">{error}</p>}
    </div>
  );
}

/** A group of controls (chips, map, ...) that share one label. */
export function FieldGroup({ label, hint, error, children }) {
  const id = useId();
  return (
    <div className={`sx-field${error ? " sx-field--bad" : ""}`} role="group" aria-labelledby={`${id}-l`}>
      <div className="sx-field__top"><span id={`${id}-l`} className="sx-label">{label}</span></div>
      {children}
      {hint && <p className="sx-hint">{hint}</p>}
      {error && <p className="sx-error" role="alert">{error}</p>}
    </div>
  );
}

export const Counter = ({ value, max }) => (
  <span className={`sx-counter${value.length > max ? " sx-counter--over" : ""}`} aria-live="off">{value.length}/{max}</span>
);

/** Toggle chips for a fixed list; optional custom entries. */
export function ChipPicker({ options, value, onChange, max, allowCustom = false, customMax = 40, label = "Add your own" }) {
  const [text, setText] = useState("");
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  const toggle = (o) => {
    if (value.includes(o)) onChange(value.filter((v) => v !== o));
    else if (!max || value.length < max) onChange([...value, o]);
  };
  const add = () => {
    const t = text.trim().slice(0, customMax);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && (!max || value.length < max)) onChange([...value, t]);
    setText("");
  };
  return (
    <div>
      <div className="sx-chips">
        {all.map((o) => (
          <button key={o} type="button" className="sx-toggle" aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{o}</button>
        ))}
      </div>
      {allowCustom && (
        <div className="sx-row sx-addrow">
          <input
            aria-label={label}
            placeholder={label}
            value={text}
            maxLength={customMax}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <button type="button" className="sx-btn" onClick={add} disabled={!text.trim()}>Add</button>
        </div>
      )}
    </div>
  );
}

/** Free-form short tags with remove buttons. */
export function TokenInput({ value, onChange, max, length, label = "Add a tag" }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim().replace(/,+$/, "").slice(0, length);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t]);
    setText("");
  };
  return (
    <div>
      <ul className="sx-chips" aria-label="Current tags">
        {value.map((t) => (
          <li key={t} className="sx-token">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>×</button>
          </li>
        ))}
      </ul>
      <div className="sx-row sx-addrow">
        <input
          aria-label={label}
          placeholder={value.length >= max ? `Up to ${max} tags` : label}
          value={text}
          maxLength={length}
          disabled={value.length >= max}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        />
        <button type="button" className="sx-btn" onClick={add} disabled={!text.trim() || value.length >= max}>Add</button>
      </div>
    </div>
  );
}

export function UpgradePrompt({ children, price }) {
  return (
    <div className="sx-upgrade">
      <PremiumChip />
      <p>{children}</p>
      <Link className="sx-btn sx-btn--primary" to="/business/plan">{price ? `Upgrade for ${kes(price)} more a month` : "Upgrade to Premium"}</Link>
    </div>
  );
}

export const Dl = ({ rows }) => (
  <dl className="sx-dl">
    {rows.map(([k, v]) => (
      <div key={k}><dt>{k}</dt><dd>{v === null || v === undefined || v === "" ? <span className="sx-muted">Not set</span> : v}</dd></div>
    ))}
  </dl>
);
