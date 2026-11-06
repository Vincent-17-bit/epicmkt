import { T } from "./text.js";
import s from "./values.module.css";

// A chosen value, shown exactly as typed. A colour with a shade is a swatch card; every other value is a text card.
// The name is always written out, so colour is never the only way to tell values apart. Pending values say so in words.
export default function ValueChip({ value, describedBy }) {
  const shade = value.kind === "color" && value.hex ? value.hex : null;
  return (
    <span className={shade ? s.swatchCard : s.textCard} data-testid="value-chip" data-card={shade ? "swatch" : "text"} aria-describedby={describedBy}>
      {shade && <span className={s.swatch} style={{ background: shade }} role="img" aria-label={T.swatchFor(value.label)} />}
      <span className={s.chipName}>{value.label}</span>
      {value.status === "pending" && <span className={s.badge}>{T.pendingBadge}</span>}
    </span>
  );
}
