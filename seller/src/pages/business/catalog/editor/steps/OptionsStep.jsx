import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faPlus } from "@fortawesome/free-solid-svg-icons";
import { AXIS_PRESETS, addAxis, canAddAxis, effectiveLimits, emptyOptionsForm, limitMessage, removeAxis } from "@epicmkt/shared";
import { SectionCard } from "../parts.jsx";
import { useProductTypes } from "./useProductTypes.js";
import AxisCard from "./options/AxisCard.jsx";
import Combinations, { SummaryTiles } from "./options/Combinations.jsx";
import ed from "../editor.module.css";
import s from "./options/options.module.css";

// Item options: colours, sizes, storage, styles. Axes come from the product type; every combination has its own price and stock.
// Items with no options never see this step (see steps/index.js), and saving without touching it changes nothing.
export default function OptionsStep({ form, patch, errors }) {
  const { types, business } = useProductTypes();
  const [said, setSaid] = useState("");
  const options = form.options ?? emptyOptionsForm();
  const set = (next) => patch("options", next);
  // TODO(contract:B6a) the plan's caps on options, once the subscription returns them. Until then the hard limits apply.
  const limits = effectiveLimits(business?.planLimits?.options);
  const type = types.find((t) => t.id === form.productTypeId);
  // TODO(contract:A06) a type's own axes ({ key, label, display }) once seller_product_types returns them; the common ones until then.
  const presets = (Array.isArray(type?.axes) && type.axes.length ? type.axes : AXIS_PRESETS).filter((p) => !options.axes.some((a) => a.label.toLowerCase() === p.label.toLowerCase()));
  const found = errors?.options ?? {};
  const roomForAxis = canAddAxis(options, limits);
  const itemPrice = String(form.price ?? "").replace(/,/g, "");

  const start = (p) => { set(addAxis(options, p, limits)); setSaid(`${p.label || "A new option"} added.`); };

  return (
    <SectionCard id="options" title="Options" why="Colours, sizes or styles buyers choose from. Each combination can have its own price and stock.">
      <div className={s.stack}>
        <p className={ed.sr} role="status" aria-live="polite">{said}</p>

        {options.axes.length === 0 ? (
          <div className={s.start}>
            <p className={s.startTitle}><FontAwesomeIcon icon={faLayerGroup} aria-hidden="true" /> What do buyers choose?</p>
            <p className={s.startText}>Pick one to start. You can add up to {limits.axes} option types, each with up to {limits.values} values.</p>
            <ul className={s.presets}>
              {presets.map((p) => <li key={p.label}><button type="button" className={s.pill} onClick={() => start(p)}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />{p.label}</button></li>)}
              <li><button type="button" className={`${s.pill} ${s.pillPrimary}`} onClick={() => start({ label: "", display: "button" })}>Your own</button></li>
            </ul>
          </div>
        ) : (
          <>
            <ol className={s.axes}>
              {options.axes.map((a, i) => (
                <AxisCard key={a.rid ?? a.key} options={options} index={i} set={set} limits={limits} errors={found} announce={setSaid} onRemove={(k) => set(removeAxis(options, k))} />
              ))}
            </ol>
            <div className={s.stack}>
              <p className={s.counterRow}><span>{options.axes.length} of {limits.axes} option types</span></p>
              {roomForAxis ? (
                <ul className={s.presets}>
                  {presets.slice(0, 4).map((p) => <li key={p.label}><button type="button" className={s.pill} onClick={() => start(p)}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />Add {p.label}</button></li>)}
                  <li><button type="button" className={s.pill} onClick={() => start({ label: "", display: "button" })}>Add your own</button></li>
                </ul>
              ) : (
                <p className={s.limit} role="status">{limitMessage("axes", limits, limits.axes < 3)}</p>
              )}
            </div>
            <SummaryTiles options={options} itemPrice={itemPrice} />
            <Combinations options={options} set={set} errors={found} announce={setSaid} itemPrice={itemPrice} />
          </>
        )}
      </div>
    </SectionCard>
  );
}
