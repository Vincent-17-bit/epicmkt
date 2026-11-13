import { useId, useRef, useState } from "react";
import { collapseToPriceAxes, formatKes as kes, groupPrice, groupSold, liveRows, priceIssues, priceLayout, rowKeyOf, setBasePlusDifference, setGroupPrice, setGroupSold, setRelativePrice, summarize } from "@epicmkt/shared";
import ed from "../../editor.module.css";
import s from "./options.module.css";

const formatKes = (n) => kes(n, { decimals: 0 });
const valueLabel = (axis, id) => axis.values.find((v) => v.id === id)?.label ?? id;
const nameOf = (options) => (r) => options.axes.map((a) => valueLabel(a, r.choice[a.key])).join(" ");

// "What changes the price?": the seller ticks the options that change the price and types prices where they think about them.
// One option -> a list; two -> a grid (or base + difference); three or more -> the full table of combinations below.
// Everything is stored per combination as one absolute price, so nothing downstream (flash, totals, filters) changes.
export default function PriceModes({ options, set, announce, itemPrice, priceAxes, setPriceAxes, errors = {} }) {
  const uid = useId();
  const box = useRef(null);
  const [view, setView] = useState("grid");
  const [base, setBase] = useState({});
  const [diff, setDiff] = useState({});
  const [rel, setRel] = useState({ value: "", from: "", delta: "" });
  const axes = options.axes;
  if (axes.length === 0 || liveRows(options).length === 0) return null;
  const chosen = priceAxes ?? [];
  const layout = priceLayout(chosen);
  const axisOf = (k) => axes.find((a) => a.key === k);
  const issues = priceIssues(options, { itemPrice, name: nameOf(options) });
  const sum = summarize(options, itemPrice);

  const toggle = (key, on) => {
    const next = axes.map((a) => a.key).filter((k) => (k === key ? on : chosen.includes(k)));
    if (!on) set(collapseToPriceAxes(options, next));
    setPriceAxes(next);
    announce(next.length === 0 ? "One price for every combination." : `Price changes with ${next.map((k) => axisOf(k).label).join(" and ")}.`);
  };
  const nothing = () => { set(collapseToPriceAxes(options, [])); setPriceAxes([]); announce("One price for every combination."); };
  const put = (choice, value) => set(setGroupPrice(options, chosen, choice, value));

  const fix = (key) => {
    const row = options.rows.find((r) => rowKeyOf(options, r.choice) === key);
    const gkey = row ? chosen.map((k) => row.choice[k]).join("|") : "";
    const root = box.current?.ownerDocument ?? document;
    const target = (layout === "list" || layout === "grid" || layout === "single") ? root.querySelector(`[data-price-group="${uid}:${gkey}"]`) : root.querySelector(`[data-focus="opt-row:${key}:price"]`);
    target?.focus();
  };

  const input = (choice, label, extra = {}) => {
    const gkey = chosen.map((k) => choice[k]).join("|");
    if (!groupSold(options, chosen, choice)) {
      return <button type="button" className={s.notSold} data-price-group={`${uid}:${gkey}`} aria-label={`${label.replace(/ price$/, "")} is not sold. Put back on sale.`} onClick={() => { set(setGroupSold(options, chosen, choice, true)); announce(`${label.replace(/ price$/, "")} back on sale.`); }}>Not sold</button>;
    }
    return <input data-price-group={`${uid}:${gkey}`} className={s.priceInput} inputMode="decimal" autoComplete="off" aria-label={label} value={groupPrice(options, chosen, choice)} onChange={(e) => put(choice, e.target.value)} {...extra} />;
  };

  const [a1, a2] = chosen.map(axisOf); // list: a1 is the only one. grid: a1 across, a2 down.

  return (
    <section ref={box} className={s.stack} aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className={s.comboTitle}>What changes the price?</h3>
      <fieldset className={s.priceBlock}>
        <legend className={s.hint}>Tick every option that changes the price.</legend>
        <div className={s.checkRow}>
          {axes.map((a) => (
            <label key={a.key} className={s.check}><input type="checkbox" checked={chosen.includes(a.key)} onChange={(e) => toggle(a.key, e.target.checked)} />{a.label || a.key}</label>
          ))}
          <label className={s.check}><input type="checkbox" checked={priceAxes !== null && chosen.length === 0} onChange={(e) => (e.target.checked ? nothing() : setPriceAxes(null))} />Nothing, one price</label>
        </div>
      </fieldset>

      {priceAxes !== null && layout === "single" && (
        <label className={s.cell}><span>Price for every combination (KES)</span>{input({}, "Price for every combination (KES)")}</label>
      )}

      {layout === "list" && (
        <ul className={s.priceList} aria-label={`Price by ${a1.label}`}>
          {a1.values.map((v) => (
            <li key={v.id} className={s.priceRow}><span>{v.label}</span><span className={s.kes}>KES</span>{input({ [a1.key]: v.id }, `${v.label} price`)}</li>
          ))}
        </ul>
      )}
      {layout === "list" && (
        <div className={s.quick}>
          <button type="button" className={s.pill} onClick={() => { const p = groupPrice(options, chosen, { [a1.key]: a1.values[0].id }); if (p) { let o = options; for (const v of a1.values) o = setGroupPrice(o, chosen, { [a1.key]: v.id }, p); set(o); announce(`Every ${a1.label.toLowerCase()} now costs the same.`); } }}>Same price for all</button>
        </div>
      )}
      {layout === "list" && a1.values.length > 1 && (
        <div className={s.quick} role="group" aria-label="Set one price from another">
          <label className={s.cell}><span>Set</span><select className={s.priceInput} value={rel.value || a1.values[1].id} onChange={(e) => setRel({ ...rel, value: e.target.value })}>{a1.values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
          <label className={s.cell}><span>equal to</span><select className={s.priceInput} value={rel.from || a1.values[0].id} onChange={(e) => setRel({ ...rel, from: e.target.value })}>{a1.values.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
          <label className={s.cell}><span>plus or minus (KES)</span><input className={s.priceInput} inputMode="decimal" autoComplete="off" placeholder="-1000" value={rel.delta} onChange={(e) => setRel({ ...rel, delta: e.target.value })} /></label>
          <button type="button" className={s.pill} onClick={() => { const v = rel.value || a1.values[1].id; const f = rel.from || a1.values[0].id; if (v !== f) { set(setRelativePrice(options, a1.key, v, f, rel.delta || "0")); announce("Price set."); } }}>Apply</button>
        </div>
      )}

      {layout === "grid" && (
        <>
          <div className={s.quick} role="group" aria-label="How to enter prices">
            <button type="button" className={s.pill} aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button>
            <button type="button" className={s.pill} aria-pressed={view === "diff"} onClick={() => setView("diff")}>Base + difference</button>
          </div>
          {view === "diff" && (
            <div className={s.stack}>
              <p className={s.hint}>{a2.label} sets the base price, {a1.label.toLowerCase()} adds or removes money.</p>
              <fieldset className={s.depSet}><legend>Base price for each {a2.label.toLowerCase()} (KES)</legend><div className={s.toolGrid}>{a2.values.map((v) => <label key={v.id} className={s.cell}><span>{v.label}</span><input className={s.priceInput} inputMode="decimal" autoComplete="off" aria-label={`${v.label} base price`} value={base[v.id] ?? ""} onChange={(e) => setBase({ ...base, [v.id]: e.target.value })} /></label>)}</div></fieldset>
              <fieldset className={s.depSet}><legend>Difference for each {a1.label.toLowerCase()} (KES, such as -1000)</legend><div className={s.toolGrid}>{a1.values.map((v) => <label key={v.id} className={s.cell}><span>{v.label}</span><input className={s.priceInput} inputMode="decimal" autoComplete="off" aria-label={`${v.label} difference`} value={diff[v.id] ?? ""} onChange={(e) => setDiff({ ...diff, [v.id]: e.target.value })} /></label>)}</div></fieldset>
              <button type="button" className={`${s.pill} ${s.pillPrimary}`} style={{ justifySelf: "start" }} onClick={() => { set(setBasePlusDifference(options, { baseAxis: a2.key, diffAxis: a1.key, base, diff })); announce("Prices filled in. You can still change any price in the grid."); }}>Fill the prices</button>
            </div>
          )}
          <div className={s.gridWrap} tabIndex={0} role="region" aria-label={`Prices by ${a2.label} and ${a1.label}`}>
            <table className={s.gridTable}>
              <thead><tr><th scope="col"><span className={ed.sr}>{a2.label}</span></th>{a1.values.map((c) => <th key={c.id} scope="col">{c.label}</th>)}</tr></thead>
              <tbody>
                {a2.values.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.label}</th>
                    {a1.values.map((c) => <td key={c.id}>{input({ [a1.key]: c.id, [a2.key]: r.id }, `${r.label} ${c.label} price`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {layout === "table" && <p className={s.hint}>Three or more options change the price, so each combination has its own price in the list below.</p>}

      {priceAxes !== null && layout !== "table" && Object.entries(errors).filter(([k]) => /^row:.*:price$/.test(k)).map(([k, msg]) => <p key={k} className={ed.error} role="alert">{msg}</p>)}
      {priceAxes !== null && issues.length > 0 && (
        <ul className={s.issues} aria-label="Things to check">
          {issues.map((i) => (
            <li key={`${i.kind}:${i.key}`} className={s.issue} data-kind={i.kind}><span>{i.text}</span><button type="button" className={s.pill} onClick={() => fix(i.key)}>Fix<span className={ed.sr}>: {i.text}</span></button></li>
          ))}
        </ul>
      )}
      {priceAxes !== null && <p className={s.hint} role="status">{sum.combos} {sum.combos === 1 ? "combination" : "combinations"}, {sum.inStock} in stock{sum.from !== null ? `, from ${formatKes(sum.from)}` : ""}</p>}
    </section>
  );
}
