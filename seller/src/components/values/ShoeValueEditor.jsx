import { useId, useState } from "react";
import { SHOE_SYSTEMS, shoeHelpFor, shoeRange } from "./scaleEditing.js";
import ScaleValueEditor from "./ScaleValueEditor.jsx";
import { T } from "./text.js";
import { useValueList } from "./useValueList.js";
import s from "./values.module.css";

const WIDTHS = ["narrow", "regular", "wide"];

// Shoe sizes: a system switch (EU, UK, US men, US women, cm) decides what a bare "42" means, widths are optional, every chip explains itself
// in the other systems, and "EU 38 to 47 in half steps" fills many sizes at once. Sizes in different systems that are the same shoe are
// different entries here (the seller typed them that way); the buyer page merges them by real size.
export default function ShoeValueEditor({ values, onChange, label = "Shoe size", typeId = "shoes-eu", system: systemProp, onSystemChange, ...rest }) {
  const uid = useId();
  const [local, setLocal] = useState("eu");
  const system = systemProp ?? local;
  const setSystem = (id) => { setLocal(id); onSystemChange?.(id); };
  const [range, setRange] = useState({ from: "38", to: "47", step: "1" });
  const [rangeError, setRangeError] = useState("");
  const [width, setWidth] = useState("");
  const show = (v) => `${v.system === "eu" ? "EU " : v.system === "uk" ? "UK " : v.system === "us-m" ? "US " : v.system === "us-w" ? "US " : ""}${v.value}${v.system === "cm" ? " cm" : v.system === "us-m" ? " (men)" : v.system === "us-w" ? " (women)" : ""}${v.width ? ` · ${v.width[0].toUpperCase()}${v.width.slice(1)}` : ""}`;
  const list = useValueList({ values, onChange, show });

  const apply = () => {
    const r = shoeRange({ system, ...range });
    if (!r.ok) { setRangeError(r.error); return; }
    setRangeError("");
    const withWidth = width ? r.values.map((v) => ({ ...v, width })) : r.values;
    list.addMany(withWidth);
    list.setAnnounce(T.rangeDone(withWidth.length, r.skipped));
  };

  const help = (
    <>
      {values.length > 0 && (
        <ul className={s.helpList} aria-label="What each size means in other systems">
          {values.map((v, i) => { const h = shoeHelpFor(v); return h ? <li key={i} className={s.hint}><strong>{show(v)}</strong> = {h}</li> : null; })}
        </ul>
      )}
      <fieldset className={s.fieldset}>
        <legend className={s.label}>{T.quickRange}</legend>
        <div className={s.rangeGrid}>
          {[["from", T.rangeFrom], ["to", T.rangeTo]].map(([k, l]) => (
            <label key={k} className={s.miniLabel}>{l}
              <input className={s.input} inputMode="decimal" value={range[k]} onChange={(e) => setRange({ ...range, [k]: e.target.value })} />
            </label>
          ))}
          <label className={s.miniLabel}>{T.rangeStep}
            <select className={s.input} value={range.step} onChange={(e) => setRange({ ...range, step: e.target.value })}>
              <option value="1">{T.rangeWhole}</option>
              <option value="0.5">{T.rangeHalf}</option>
            </select>
          </label>
          <label className={s.miniLabel}>Width
            <select className={s.input} value={width} onChange={(e) => setWidth(e.target.value)}>
              <option value="">Any</option>
              {WIDTHS.map((w) => <option key={w} value={w}>{w[0].toUpperCase() + w.slice(1)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className={s.ghost} onClick={apply} aria-describedby={rangeError ? `${uid}-re` : undefined}>{T.rangeApply}</button>
        {rangeError && <p id={`${uid}-re`} className={s.error} role="alert">{rangeError}</p>}
      </fieldset>
    </>
  );

  return (
    <div className={s.wrap}>
      <div className={s.seg} role="group" aria-label={T.shoeSystem}>
        {SHOE_SYSTEMS.map((x) => (
          <button key={x.id} type="button" className={s.segBtn} aria-pressed={system === x.id} onClick={() => setSystem(x.id)}>{x.label}</button>
        ))}
      </div>
      <ScaleValueEditor
        {...rest}
        scale="shoe"
        label={label}
        values={values}
        onChange={onChange}
        typeId={typeId}
        ctx={{ system }}
        show={show}
        placeholder={T.shoeTypeIn(SHOE_SYSTEMS.find((x) => x.id === system).label)}
        extra={help}
      />
    </div>
  );
}
