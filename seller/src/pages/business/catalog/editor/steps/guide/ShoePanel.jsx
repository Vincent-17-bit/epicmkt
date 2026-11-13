import { useState } from "react";
import { SHOE_SYSTEMS, shoeGuide } from "@epicmkt/shared";
import ed from "../../editor.module.css";
import s from "./guide.module.css";

const FROM = SHOE_SYSTEMS.filter((x) => x.id !== "cm");
const rangeSizes = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `EU ${from + i}`);

// Shoe sizes in every system: the seller types their sizes once, in the system they use, and the other systems are filled in.
export default function ShoePanel({ sizes, onStart, goOptions }) {
  const [system, setSystem] = useState("eu");
  const [off, setOff] = useState([]); // columns the seller unticked; the system the sizes are written in is never a column
  const include = SHOE_SYSTEMS.filter((x) => x.id !== system && !off.includes(x.id)).map((x) => x.id);
  const [width, setWidth] = useState(false);
  const [widthText, setWidthText] = useState("Standard");
  const [from, setFrom] = useState(36);
  const [to, setTo] = useState(46);
  const toggle = (id) => setOff((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const build = (list, sys) => {
    const { guide, skipped } = shoeGuide(list, { system: sys, include, width: width ? widthText.trim() || "Standard" : "" });
    onStart(guide, skipped.length ? `${skipped.join(", ")} ${skipped.length === 1 ? "is" : "are"} not a shoe size we can convert, so ${skipped.length === 1 ? "it was" : "they were"} left out. Add ${skipped.length === 1 ? "it" : "them"} by hand.` : "");
  };
  const rangeOk = Number.isInteger(from) && Number.isInteger(to) && from >= 15 && to <= 60 && from <= to;

  return (
    <div className={s.panel}>
      <p className={s.panelTitle}>Shoe sizes in every system</p>
      <p className={s.muted}>You type your sizes once. We fill in the other systems for you, and you can still change any number.</p>
      <label className={s.field}>
        <span>Your sizes are written in</span>
        <select className={s.select} value={system} onChange={(e) => setSystem(e.target.value)}>
          {FROM.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <fieldset className={s.checks}>
        <legend>Columns to fill in</legend>
        {SHOE_SYSTEMS.filter((x) => x.id !== system).map((x) => (
          <label key={x.id} className={s.check}><input type="checkbox" checked={include.includes(x.id)} onChange={() => toggle(x.id)} />{x.label}</label>
        ))}
        <label className={s.check}><input type="checkbox" checked={width} onChange={(e) => setWidth(e.target.checked)} />Width</label>
      </fieldset>
      {width && (
        <label className={s.field}>
          <span>Width, for every size to begin with</span>
          <input className={s.input} value={widthText} maxLength={20} onChange={(e) => setWidthText(e.target.value)} placeholder="Standard, Wide, D, E" />
          <span className={s.muted}>Change a single size afterwards if some are wider.</span>
        </label>
      )}
      {sizes.length > 0 ? (
        <button type="button" className={ed.btnPrimary} onClick={() => build(sizes, system)}>Build the table from my {sizes.length} sizes</button>
      ) : (
        <div className={s.rangeBox}>
          <p className={s.muted}>You have not added sizes under Options yet. {goOptions && <button type="button" className={s.linkBtn} onClick={goOptions}>Add them in Options</button>} or start from a range:</p>
          <div className={s.rangeRow}>
            <label className={s.field}><span>From EU</span><input className={s.input} inputMode="numeric" value={from} onChange={(e) => setFrom(Number(e.target.value.replace(/\D/g, "")) || 0)} /></label>
            <label className={s.field}><span>To EU</span><input className={s.input} inputMode="numeric" value={to} onChange={(e) => setTo(Number(e.target.value.replace(/\D/g, "")) || 0)} /></label>
            <button type="button" className={ed.btnPrimary} disabled={!rangeOk} onClick={() => build(rangeSizes(from, to), "eu")}>Build EU {from} to {to}</button>
          </div>
          {!rangeOk && <p className={s.muted}>Use whole numbers from 15 to 60, with the first not above the last.</p>}
        </div>
      )}
    </div>
  );
}
