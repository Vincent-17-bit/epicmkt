import { useId, useState } from "react";
import { convertShoe, scales } from "@epicmkt/shared";
import ScaleValuesEditor from "./ScaleValuesEditor.jsx";
import { T } from "./text.js";
import s from "./scale.module.css";

const SYSTEMS = scales.getScale("shoe").systems; // EU, UK, US men, US women, cm
const WIDTHS = [{ id: "", label: T.widthAny }, { id: "narrow", label: "Narrow" }, { id: "regular", label: "Regular" }, { id: "wide", label: "Wide" }, { id: "extra wide", label: "Extra wide" }];
const OTHERS = ["eu", "uk", "us-m", "us-w", "cm"];
const SYSTEM_TEXT = { eu: (n) => `EU ${n}`, uk: (n) => `UK ${n}`, "us-m": (n) => `US ${n} (men)`, "us-w": (n) => `US ${n} (women)`, cm: (n) => `${n} cm` };

/** "UK 8 · US 9 (men) · 26.7 cm" for a shoe value, from the shop's conversion table; "" when the table has no match. Exported for tests. */
export function convertedHelp(value) {
  const base = scales.format({ ...value, width: undefined });
  const parts = OTHERS.filter((sys) => sys !== value.system).flatMap((sys) => {
    const r = convertShoe(base, sys);
    return r.ok ? [SYSTEM_TEXT[sys](r.value.value)] : [];
  });
  return parts.join(" · ");
}

/**
 * Shoe sizes: pick the system once (EU, UK, US men, US women, cm) and type bare numbers, optionally with a width.
 * Every chip shows the same size in the other systems as help. "EU 42" is a shoe size and never a clothing size.
 */
export default function ShoeValuesEditor({ label = "Shoe size", values, onChange, ...rest }) {
  const uid = useId();
  const [system, setSystem] = useState(values[0]?.system ?? "eu");
  const [width, setWidth] = useState("");
  return (
    <ScaleValuesEditor
      {...rest}
      scaleId="shoe"
      label={label}
      values={values}
      onChange={onChange}
      ctx={{ ...(rest.ctx ?? {}), system }}
      systems={SYSTEMS}
      system={system}
      suffix={width}
      chipNote={(v) => convertedHelp(v)}
    >
      <fieldset className={s.choices}>
        <legend>{T.system}</legend>
        {SYSTEMS.map((o) => (
          <button key={o.id} type="button" className={s.pick} aria-pressed={system === o.id} onClick={() => setSystem(o.id)}>{o.label}</button>
        ))}
      </fieldset>
      <label className={s.field} htmlFor={`${uid}-w`}>{T.width}
        <select id={`${uid}-w`} className={s.select} value={width} onChange={(e) => setWidth(e.target.value)}>
          {WIDTHS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
        </select>
      </label>
    </ScaleValuesEditor>
  );
}
