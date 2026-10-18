import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";

// Password input with an eye button that shows or hides what was typed.
export default function PasswordField({ id, label, value, onChange, autoComplete, disabled, hint, autoFocus }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="admin-login__field">
      <label htmlFor={id}>{label}</label>
      <div className="admin-password">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="admin-password__toggle"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          disabled={disabled}
        >
          <FontAwesomeIcon icon={shown ? faEyeSlash : faEye} />
        </button>
      </div>
      {hint ? <small className="admin-login__hint">{hint}</small> : null}
    </div>
  );
}
