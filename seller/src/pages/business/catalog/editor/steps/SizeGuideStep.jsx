import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { checkGuide, guideKindFor, orderBySizes, setUnit, sizeLabels, syncSizes, GUIDE_UNITS } from "@epicmkt/shared";
import * as api from "../../../../../api/index.js";
import { SectionCard } from "../parts.jsx";
import { useProductTypes } from "./useProductTypes.js";
import GuideStart from "./guide/GuideStart.jsx";
import GuideTable from "./guide/GuideTable.jsx";
import BuyerPreview from "./guide/BuyerPreview.jsx";
import ed from "../editor.module.css";
import s from "./guide/guide.module.css";

// The seller's own size guide for this item (migration 0101). Sellers write the table; ready-made tables are only a place to start.
export default function SizeGuideStep({ form, patch, errors, goTo }) {
  const { types } = useProductTypes();
  const guide = form.sizeGuide ?? null;
  const sizes = useMemo(() => sizeLabels(form.options), [form.options]);
  const typeName = types.find((t) => t.id === form.productTypeId)?.name;
  const kind = guideKindFor(typeName, form.name) ?? "clothing";
  const [said, setSaid] = useState("");
  const [note, setNote] = useState("");
  const [sure, setSure] = useState(false);
  const charts = useQuery({ queryKey: ["sizeChartTemplates"], queryFn: api.listSizeCharts, staleTime: 5 * 60_000, retry: 1 });
  const chartsState = charts.isLoading ? "loading" : charts.isError ? "error" : "ready";
  const errs = errors?.sizeGuide ?? {};
  const check = useMemo(() => checkGuide(guide, sizes), [guide, sizes]);
  const set = (g) => patch("sizeGuide", g);
  const announce = (t) => setSaid(t);

  const begin = (g, n) => { set(g); setNote(n); setSure(false); announce("Your table is ready. Fill in the measurements."); };
  const changeUnit = (u) => { if (u !== guide.unit) { set(setUnit(guide, u)); announce(`Measurements now in ${u === "cm" ? "centimetres" : "inches"}.`); } };

  return (
    <SectionCard id="sizeguide" title="Size guide" why="A table that shows which size fits whom. You fill it in here, and buyers open it from the Size chart link next to your sizes.">
      <p className={ed.sr} role="status" aria-live="polite">{said}</p>
      {!guide ? (
        <GuideStart kind={kind} sizes={sizes} charts={charts.data ?? []} chartsState={chartsState} onStart={begin} goOptions={goTo ? () => goTo("options") : undefined} />
      ) : (
        <div className={s.editor}>
          {note && <p className={s.note} role="status"><FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" /> {note}</p>}
          <div className={s.toolbar}>
            <div role="radiogroup" aria-label="Measurements are in" className={s.seg}>
              {GUIDE_UNITS.map((u) => (
                <button key={u} type="button" role="radio" aria-checked={guide.unit === u} className={s.segBtn} onClick={() => changeUnit(u)}>{u === "cm" ? "Centimetres" : "Inches"}</button>
              ))}
            </div>
            <div className={s.toolRight}>
              {sizes.length > 0 && <button type="button" className={s.pill} onClick={() => { set(orderBySizes(guide, sizes)); announce("Rows now follow your size order."); }}>Match my size order</button>}
              {!sure ? (
                <button type="button" className={`${s.pill} ${s.pillDanger}`} onClick={() => setSure(true)}>Start over</button>
              ) : (
                <span className={s.confirm} role="group" aria-label="Start over?">
                  <span>Remove this table?</span>
                  <button type="button" className={`${s.pill} ${s.pillDanger}`} onClick={() => { set(null); setSure(false); setNote(""); announce("The table was removed."); }}>Yes, remove</button>
                  <button type="button" className={s.pill} onClick={() => setSure(false)}>Keep it</button>
                </span>
              )}
            </div>
          </div>

          {check.warnings.filter((w) => w.code !== "blank").map((w) => (
            <p key={w.code} className={s.warn} role="status">
              <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" /> <span>{w.message}</span>
              {w.code === "missing" && <button type="button" className={s.linkBtn} onClick={() => { const r = syncSizes(guide, sizes); set(r.guide); announce(`Added rows for ${r.added.join(", ")}.`); }}>Add the missing rows</button>}
            </p>
          ))}

          <GuideTable guide={guide} onChange={set} errors={errs} announce={announce} />
          {check.warnings.some((w) => w.code === "blank") && <p className={s.muted}>{check.warnings.find((w) => w.code === "blank").message}</p>}

          <BuyerPreview guide={guide} />
        </div>
      )}
    </SectionCard>
  );
}
