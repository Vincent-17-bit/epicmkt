import { useState } from "react";
import { ItemDetails, ItemSpecs } from "@epicmkt/ui";
import { t as clientT } from "../../i18n/index.js";
import { specGroupsFor, topHighlights, variantOverrides } from "../../lib/itemView.js";
import ClientItemSpecs from "../ItemSpecs.jsx";
import DetailsTabs from "./DetailsTabs.jsx";
import styles from "./DetailsTabs.module.css";

const typed = (item) => Boolean(item?.productType);

function TypedDetails({ ctx, slot }) {
  const { item, t = clientT, marks } = slot;
  const [active, setActive] = useState("description");
  const [reveal, setReveal] = useState(0);
  const category = ctx?.business?.category;
  const attributes = ctx?.business?.attributes;
  const overrides = variantOverrides(ctx?.option?.variant);
  const groups = specGroupsFor({ item, category, attributes, overrides });
  const top = topHighlights(groups);
  const hasSpecs = groups.length > 0 || (item.includes?.length ?? 0) > 0 || Boolean(item.terms);
  const specItem = overrides ? { ...item, specs: groups.flatMap((g) => g.rows.map((r) => ({ group: g.name, label: r.label, value: r.value }))) } : item;
  const bullets = { ...item, description: "", shortDescription: "" };
  const prose = { ...item, highlights: [] };
  const more = hasSpecs ? () => { setActive("specs"); setReveal((n) => n + 1); } : undefined;
  const tabs = [
    { id: "description", label: t("item.description"), content: <ItemDetails item={prose} t={t} marks={marks} /> },
    hasSpecs && { id: "specs", label: t("item.specs"), content: <ClientItemSpecs item={specItem} category={category} attributes={attributes} reveal={reveal} onExpand={(panel) => ctx?.track?.("spec_expand", { panel })} /> }
  ].filter(Boolean);
  const hasProse = Boolean(item.description || item.shortDescription);
  const shown = hasProse ? tabs : tabs.filter((tab) => tab.id !== "description");
  const current = shown.some((tab) => tab.id === active) ? active : shown[0]?.id;

  return (
    <>
      {top.length > 0 && (
        <section className={styles.top} aria-labelledby="item-top-highlights">
          <h3 id="item-top-highlights" className={styles.topTitle}>{t("item.topHighlights")}</h3>
          <dl className={styles.topList}>
            {top.map((row) => (
              <div key={row.label} className={styles.topRow}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <ItemDetails item={bullets} t={t} marks={marks} onMoreSpecs={more} />
      {shown.length > 1 && <DetailsTabs tabs={shown} active={current} onChange={setActive} label={t("item.detailsTabs")} />}
      {shown.length === 1 && shown[0].content}
    </>
  );
}

// Details slot: highlights and description (ui's ItemDetails; renders nothing when there is neither). An item with a product type gets
// Top highlights, About this item, and Description and Specifications tabs.
export default function Details({ ctx, slot }) {
  if (!slot?.item) return null;
  if (typed(slot.item)) return <TypedDetails ctx={ctx} slot={slot} />;
  return <ItemDetails {...slot} />;
}

// The specs table is the other half of Details. It sits in its own column of the layout, so it is a second component, not a second slot.
// A typed item shows it in the Specifications tab instead.
export function Specs({ slot }) {
  if (!slot?.item || typed(slot.item)) return null;
  return <ItemSpecs {...slot} />;
}
