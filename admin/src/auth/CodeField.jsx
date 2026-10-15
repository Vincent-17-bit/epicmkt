import { useEffect, useRef } from "react";

/** Six-digit authenticator code. Digits only, one-time-code autofill, numeric keyboard on phones. */
export default function CodeField({ value, onChange, label = "6-digit code", autoFocus = true }) {
  const input = useRef(null);
  useEffect(() => { if (autoFocus) input.current?.focus(); }, [autoFocus]);
  return (
    <label className="field">
      <span>{label}</span>
      <input ref={input} className="code-input" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))} />
    </label>
  );
}
