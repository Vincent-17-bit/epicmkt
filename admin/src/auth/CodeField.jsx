import { useEffect, useRef } from "react";

/** Six-digit authenticator code. Digits only, one-time-code autofill, numeric keyboard on phones. */
export default function CodeField({ id, value, onChange, label = "6-digit code", autoFocus = true }) {
  const input = useRef(null);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  return (
    <div className="admin-login__field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        className="admin-login__code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </div>
  );
}
