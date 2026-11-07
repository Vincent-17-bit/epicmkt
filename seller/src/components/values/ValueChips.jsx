import { T } from "./text.js";
import s from "./values.module.css";

// The values of one option axis, in the order buyers will see them. Each can move earlier or later and be removed; the buttons name the
// value, so a screen reader hears "Move 10 L earlier", never just "Move". `show(value)` is how a value reads to a buyer.
export default function ValueChips({ values, show, onMove, onRemove, disabled = false, label }) {
  if (values.length === 0) return <p className={s.hint}>{T.nothingYet}</p>;
  return (
    <ul className={s.chips} aria-label={T.valuesLabel(label)}>
      {values.map((v, i) => {
        const text = show(v);
        return (
          <li key={`${i}-${text}`} className={s.chip}>
            <span className={s.chipText}>{text}</span>
            <span className={s.chipActions}>
              <button type="button" className={s.chipBtn} disabled={disabled || i === 0} aria-label={T.moveEarlier(text)} onClick={() => onMove(i, -1)}>←</button>
              <button type="button" className={s.chipBtn} disabled={disabled || i === values.length - 1} aria-label={T.moveLater(text)} onClick={() => onMove(i, 1)}>→</button>
              <button type="button" className={s.chipBtn} disabled={disabled} aria-label={T.removeValue(text)} onClick={() => onRemove(i)}>×</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
