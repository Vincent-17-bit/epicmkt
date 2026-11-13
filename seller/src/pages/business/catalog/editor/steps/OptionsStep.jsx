import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faPlus } from "@fortawesome/free-solid-svg-icons";
import { AXIS_PRESETS, CUSTOM_SIZE_STORED, addAxis, addTypeAxes, canAddAxis, effectiveLimits, emptyOptionsForm, inferPriceAxes, limitMessage, priceLayout, removeAxis } from "@epicmkt/shared";
import { SectionCard } from "../parts.jsx";
import { useProductTypes } from "./useProductTypes.js";
import AxisCard from "./options/AxisCard.jsx";
import CustomSizeEditor from "./options/CustomSizeEditor.jsx";
import Combinations, { SummaryTiles } from "./options/Combinations.jsx";
import PriceModes from "./options/PriceModes.jsx";
import ed from "../editor.module.css";
import s from "./options/options.module.css";

// Item options: colours, sizes, storage, styles. Axes come from the product type; every combination has its own price and stock.
// Items with no options never see this step (see steps/index.js), and saving without touching it changes nothing.
export default function OptionsStep({ form, patch, errors, media }) {
  const { types, planLimits } = useProductTypes();
  const [said, setSaid] = useState("");
  const options = form.options ?? emptyOptionsForm();
  // Which options change the price. null = the seller has not said yet (the plain list of combinations, as before). An existing
  // item starts from what its saved prices already show.
  const [priceAxes, setPriceAxes] = useState(() => { const found = inferPriceAxes(options); return found.length ? found : null; });
  const known = priceAxes === null ? null : priceAxes.filter((k) => options.axes.some((a) => a.key === k));
  const modeLayout = known === null ? null : priceLayout(known);
  const set = (next) => patch("options", next);
  const limits = effectiveLimits(planLimits);
  const type = types.find((t) => t.id === form.productTypeId);
  // A type's own axes ({ key, label, display, scale? }) when it has them, the common ones otherwise. TODO(contract:A06) real types carry axes.
  const typeAxes = Array.isArray(type?.axes) ? type.axes : [];
  const presets = (Array.isArray(type?.axes) && type.axes.length ? type.axes : AXIS_PRESETS).filter((p) => !options.axes.some((a) => a.label.toLowerCase() === p.label.toLowerCase()));
  const found = errors?.options ?? {};
  const roomForAxis = canAddAxis(options, limits);
  const itemPrice = String(form.price ?? "").replace(/,/g, "");
  const photos = (media?.tiles ?? []).filter((t) => t.kind === "image" && t.status === "saved" && t.id).map((t) => ({ id: t.id, url: t.url }));
  const unsavedPhotos = (media?.tiles ?? []).some((t) => t.kind === "image" && t.status !== "saved");

  const start = (p) => { set(addAxis(options, p, limits)); setSaid(`${p.label || "A new option"} added.`); };

  return (
    <SectionCard id="options" title="Options" why="Colours, sizes or styles buyers choose from. Each combination can have its own price and stock.">
      <div className={s.stack}>
        <p className={ed.sr} role="status" aria-live="polite">{said}</p>

        {options.axes.length === 0 ? (
          <div className={s.start}>
            <p className={s.startTitle}><FontAwesomeIcon icon={faLayerGroup} aria-hidden="true" /> What do buyers choose?</p>
            <p className={s.startText}>Pick one to start. You can add up to {limits.axes} option types, each with up to {limits.values} values.</p>
            {typeAxes.length > 0 && (
              <button type="button" className={`${s.pill} ${s.pillPrimary}`} style={{ justifySelf: "start" }}
                onClick={() => { const r = addTypeAxes(options, typeAxes, limits); set(r.options); setSaid(`${r.added} option ${r.added === 1 ? "type" : "types"} added for ${type.name}.`); }}>
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" />Use the usual options for {type.name} ({typeAxes.map((a) => a.label).join(", ")})
              </button>
            )}
            <ul className={s.presets}>
              {presets.map((p) => <li key={p.label}><button type="button" className={s.pill} onClick={() => start(p)}><FontAwesomeIcon icon={faPlus} aria-hidden="true" />{p.label}</button></li>)}
              <li><button type="button" className={`${s.pill} ${s.pillPrimary}`} onClick={() => start({ label: "", display: "button" })}>Your own</button></li>
            </ul>
          </div>
        ) : (
          <>
            <ol className={s.axes}>
              {options.axes.map((a, i) => (
                <AxisCard key={a.rid ?? a.key} options={options} index={i} set={set} limits={limits} errors={found} announce={setSaid} photos={photos} unsavedPhotos={unsavedPhotos} onRemove={(k) => set(removeAxis(options, k))} />
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
            <PriceModes options={options} set={set} announce={setSaid} itemPrice={itemPrice} priceAxes={known} setPriceAxes={setPriceAxes} errors={found} />
            <Combinations options={options} set={set} errors={found} announce={setSaid} itemPrice={itemPrice} hidePrice={modeLayout === "single" || modeLayout === "list" || modeLayout === "grid"} />
            {CUSTOM_SIZE_STORED && <CustomSizeEditor options={options} config={form.customSize} set={(v) => patch("customSize", v)} errors={found} announce={setSaid} />}
          </>
        )}
      </div>
    </SectionCard>
  );
}
