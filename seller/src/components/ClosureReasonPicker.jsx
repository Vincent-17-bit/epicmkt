import { useId, useState } from "react";
import { useDefaults } from "../lib/useDefaults.js";

// The reason list for the temporary-closure sheet. Reads the seller's saved reasons and messages,
// so editing them in Settings changes what the sheet offers.
export default function ClosureReasonPicker({ onChange, value = null }) {
  const { closureReasons } = useDefaults();
  const name = useId();
  const [picked, setPicked] = useState(value);
  const pick = (reason) => {
    setPicked(reason.id);
    onChange?.({ id: reason.id, label: reason.label, message: reason.message });
  };
  return (
    <fieldset>
      <legend>Why are you closing?</legend>
      {closureReasons.map((r) => (
        <label key={r.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", minHeight: 44 }}>
          <input type="radio" name={name} checked={picked === r.id} onChange={() => pick(r)} />
          <span>{r.label}{r.message ? <small style={{ display: "block", color: "var(--text-muted)" }}>{r.message}</small> : null}</span>
        </label>
      ))}
    </fieldset>
  );
}
