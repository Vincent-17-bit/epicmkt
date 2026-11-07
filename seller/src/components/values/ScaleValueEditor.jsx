import { useId, useState } from "react";
import { scales } from "@epicmkt/shared";
import { previewOf, readEntries, warningFor } from "./scaleEditing.js";
import { T } from "./text.js";
import { useValueList } from "./useValueList.js";
import ValueChips from "./ValueChips.jsx";
import s from "./values.module.css";

// One editor for every scale that is typed as text: choice chips (label), count, volume, weight, duration, portion, voltage, power,
// ip-rating, color-temperature, and the text-entered measurement scales (apparel, kids age, collar, screen, storage, length, bed size, tyre,
// paper). Everything goes through scales.parse / scales.format, so:
//   "20" for a volume asks which unit; "20 litres" reads as 20 L; the preview shows what a buyer will read; a duplicate merges quietly.
// `values` are stored scale values; onChange always gets stored scale values, never bare text.
export default function ScaleValueEditor({ scale, values, onChange, label, typeId = null, axisKey = "size", ctx = {}, hint, placeholder, disabled = false, id, extra = null, show: showProp }) {
  const uid = useId();
  const ids = { input: id ?? `${uid}-in`, hint: `${uid}-hint`, err: `${uid}-err`, preview: `${uid}-pv`, unit: `${uid}-unit` };
  const show = showProp ?? ((v) => previewOf(v, { typeId }));
  const list = useValueList({ values, onChange, show });
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);

  const examples = scales.getScale(scale)?.examples?.valid?.slice(0, 3) ?? [];
  const live = text.trim() ? readEntries(scale, text, ctx) : null;
  const errorText = live && !live.ok && !live.needsUnit ? live.error.message : "";
  const needsUnit = Boolean(live && !live.ok && live.needsUnit);
  const warn = live?.ok ? live.values.map((v) => warningFor(typeId, axisKey, v)).find(Boolean) ?? "" : "";
  const previewText = live?.ok ? live.values.map(show).join(", ") : "";

  const commit = (raw) => {
    const r = readEntries(scale, raw, ctx);
    if (!r.ok) {
      setTried(true); // a missing unit is already being asked for below; any other problem is shown as an alert
      return;
    }
    setTried(false);
    list.addMany(r.values);
    setText("");
  };
  const submit = () => commit(text);
  // "20" + "l": put the unit after the entry that asked for it, then read it again.
  const chooseUnit = (unit) => commit(text.replace(live.text, `${live.text} ${unit}`));

  const describedBy = [hint ? ids.hint : null, errorText && tried ? ids.err : null, previewText || warn ? ids.preview : null, needsUnit ? ids.unit : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={s.wrap} role="group" aria-labelledby={`${ids.input}-label`}>
      <label id={`${ids.input}-label`} htmlFor={ids.input} className={s.label}>{label}</label>
      {hint && <p id={ids.hint} className={s.hint}>{hint}</p>}
      <ValueChips values={values} show={show} onMove={list.move} onRemove={list.remove} disabled={disabled} label={label} />
      <div className={s.addRow}>
        <input
          id={ids.input}
          className={s.input}
          value={text}
          disabled={disabled}
          placeholder={placeholder ?? (examples.length ? `e.g. ${examples.join(", ")}` : "")}
          aria-invalid={Boolean(errorText && tried) || undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          onChange={(e) => { setText(e.target.value); list.setNotice(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        />
        <button type="button" className={s.ghost} disabled={disabled || !text.trim()} aria-label={T.addValueLabel(label)} onClick={submit}>{T.addValue}</button>
      </div>

      {needsUnit && (
        <div id={ids.unit} className={s.unitAsk} role="group" aria-label={T.whichUnit(live.text)}>
          <p className={s.hint}>{T.whichUnit(live.text)}</p>
          <div className={s.seg}>
            {live.units.map((u) => (
              <button key={u} type="button" className={s.segBtn} onClick={() => chooseUnit(u)}>{u}</button>
            ))}
          </div>
        </div>
      )}

      {errorText && (
        <p id={ids.err} className={s.error} role={tried ? "alert" : undefined}>{errorText}</p>
      )}
      <p id={ids.preview} className={s.preview} aria-live="polite">
        {previewText ? <><span className={s.previewLabel}>{T.previewLabel}:</span> <strong>{previewText}</strong></> : <span className={s.hint}>{T.previewNone}</span>}
      </p>
      {warn && <p className={s.warn} role="status"><strong>{T.checkNumber}</strong> {warn}</p>}
      {list.notice && <p className={s.quiet} role="status">{list.notice}</p>}
      {extra}
      <p className={s.sr} role="status" aria-live="polite">{list.announce}</p>
    </div>
  );
}
