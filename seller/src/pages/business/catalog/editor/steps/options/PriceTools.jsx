import { useId, useRef, useState } from "react";
import { fillDownPrices, pastePrices, setBasePlusDifference, setPricesByAxis, setSamePrice } from "@epicmkt/shared";
import ed from "../../editor.module.css";
import s from "./options.module.css";

// "Fill prices faster": ways to type prices where the seller thinks about them, plus paste from a spreadsheet and fill down
// (B09). Each one only fills the list below; every price is stored per combination, so the seller can still change any single
// one afterwards. The last bulk change can be undone (one step).
export default function PriceTools({ options, set, announce }) {
  const uid = useId();
  const before = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [pasted, setPasted] = useState("");
  // Every bulk change goes through here so it can be undone.
  const bulk = (next, message) => {
    before.current = options;
    setCanUndo(true);
    set(next);
    announce(message);
  };
  const undo = () => {
    if (!before.current) return;
    set(before.current);
    before.current = null;
    setCanUndo(false);
    announce("Last change undone.");
  };
  const paste = (text = pasted) => {
    const r = pastePrices(options, text);
    if (r.filled === 0) {
      announce(r.skipped ? "None of the pasted rows matched an option on this item. Use the same names as above." : "Nothing to paste.");
      return;
    }
    bulk(r.options, `${r.filled} price${r.filled === 1 ? "" : "s"} filled from the paste${r.skipped ? `, ${r.skipped} row${r.skipped === 1 ? "" : "s"} skipped` : ""}.`);
    setPasted("");
  };
  const fillDown = () => {
    const r = fillDownPrices(options);
    if (r.filled === 0) announce("Every combination already has a price, or none has one to copy.");
    else bulk(r.options, `${r.filled} empty price${r.filled === 1 ? "" : "s"} filled from the row above.`);
  };
  const axes = options.axes;
  const [mode, setMode] = useState("same");
  const [same, setSame] = useState("");
  const [axisKey, setAxisKey] = useState(axes[0]?.key ?? "");
  const [baseKey, setBaseKey] = useState(axes[0]?.key ?? "");
  const [diffKey, setDiffKey] = useState(axes[1]?.key ?? axes[0]?.key ?? "");
  const [byAxis, setByAxis] = useState({});
  const [base, setBase] = useState({});
  const [diff, setDiff] = useState({});
  const two = axes.length >= 2;
  const axisOf = (k) => axes.find((a) => a.key === k) ?? axes[0];
  const money = (state, put, id, label) => (
    <div className={ed.field} key={id}>
      <label className={ed.label} htmlFor={`${uid}-${id}`}>{label}</label>
      <input id={`${uid}-${id}`} className={ed.input} inputMode="decimal" autoComplete="off" value={state[id] ?? ""} onChange={(e) => put({ ...state, [id]: e.target.value })} />
    </div>
  );

  const apply = () => {
    const next = mode === "same" ? setSamePrice(options, same) : mode === "axis" ? setPricesByAxis(options, axisKey, byAxis) : setBasePlusDifference(options, { baseAxis: baseKey, diffAxis: diffKey, base, diff });
    bulk(next, "Prices filled in. You can still change any single price below.");
  };

  return (
    <details className={s.tools}>
      <summary className={s.toolsSummary}>Fill prices faster</summary>
      <div className={s.stack}>
        <div className={ed.field}>
          <label className={ed.label} htmlFor={`${uid}-mode`}>How do you want to price?</label>
          <select id={`${uid}-mode`} className={ed.input} value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="same">One price for everything</option>
            <option value="axis">A price for each {axisOf(axisKey)?.label?.toLowerCase() || "option"}</option>
            {two && <option value="diff">A base price plus or minus a difference</option>}
          </select>
        </div>

        {mode === "same" && money({ same }, (v) => setSame(v.same), "same", "Price for every combination (KES)")}

        {mode === "axis" && (
          <>
            {axes.length > 1 && (
              <div className={ed.field}>
                <label className={ed.label} htmlFor={`${uid}-axis`}>Price depends on</label>
                <select id={`${uid}-axis`} className={ed.input} value={axisKey} onChange={(e) => setAxisKey(e.target.value)}>{axes.map((a) => <option key={a.key} value={a.key}>{a.label || a.key}</option>)}</select>
              </div>
            )}
            <div className={s.toolGrid}>{axisOf(axisKey).values.map((v) => money(byAxis, setByAxis, v.id, `${v.label} (KES)`))}</div>
          </>
        )}

        {mode === "diff" && (
          <>
            <div className={s.toolGrid}>
              <div className={ed.field}>
                <label className={ed.label} htmlFor={`${uid}-base`}>Sets the base price</label>
                <select id={`${uid}-base`} className={ed.input} value={baseKey} onChange={(e) => { setBaseKey(e.target.value); if (e.target.value === diffKey) setDiffKey(axes.find((a) => a.key !== e.target.value).key); }}>{axes.map((a) => <option key={a.key} value={a.key}>{a.label || a.key}</option>)}</select>
              </div>
              <div className={ed.field}>
                <label className={ed.label} htmlFor={`${uid}-diff`}>Adds or removes money</label>
                <select id={`${uid}-diff`} className={ed.input} value={diffKey} onChange={(e) => { setDiffKey(e.target.value); if (e.target.value === baseKey) setBaseKey(axes.find((a) => a.key !== e.target.value).key); }}>{axes.filter((a) => a.key !== baseKey).map((a) => <option key={a.key} value={a.key}>{a.label || a.key}</option>)}</select>
              </div>
            </div>
            <fieldset className={s.depSet}><legend>Base price for each {axisOf(baseKey).label.toLowerCase()}</legend><div className={s.toolGrid}>{axisOf(baseKey).values.map((v) => money(base, setBase, v.id, `${v.label} (KES)`))}</div></fieldset>
            <fieldset className={s.depSet}><legend>Difference for each {axisOf(diffKey).label.toLowerCase()}</legend><div className={s.toolGrid}>{axisOf(diffKey).values.map((v) => money(diff, setDiff, v.id, `${v.label} (KES, such as -1000)`))}</div></fieldset>
          </>
        )}

        <button type="button" className={`${s.pill} ${s.pillPrimary}`} style={{ justifySelf: "start" }} onClick={apply}>Fill the prices</button>

        <div className={ed.field}>
          <label className={ed.label} htmlFor={`${uid}-paste`}>Paste from a spreadsheet</label>
          <p className={s.hint} id={`${uid}-paste-hint`}>
            Copy two columns (an option and its price, such as "Black 25000") or a grid (one option across the top, another down the side) and paste it here.
          </p>
          <textarea
            id={`${uid}-paste`}
            className={`${ed.input} ${s.paste}`}
            rows={4}
            aria-describedby={`${uid}-paste-hint`}
            value={pasted}
            placeholder={"\tBlack\tGrey\n128 GB\t22000\t21000"}
            onChange={(e) => setPasted(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData?.getData("text/plain");
              if (text && /\t|\n/.test(text)) {
                e.preventDefault();
                paste(text);
              }
            }}
          />
        </div>
        <div className={s.toolRow}>
          <button type="button" className={s.pill} onClick={() => paste()} disabled={!pasted.trim()}>Use the pasted prices</button>
          <button type="button" className={s.pill} onClick={fillDown}>Fill down empty prices</button>
          <button type="button" className={s.pill} onClick={undo} disabled={!canUndo}>Undo last change</button>
        </div>
      </div>
    </details>
  );
}
