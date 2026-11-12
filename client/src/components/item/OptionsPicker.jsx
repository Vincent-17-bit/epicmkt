import { useId, useRef, useState } from "react";
import { OptionCard, OptionSelect } from "@epicmkt/ui";
import { axisCards, formatCapacityLabel } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import { kesText } from "../../lib/flash.js";
import SizeChartLink from "./SizeChartModal.jsx";
import ShoeConversionTable from "./ShoeConversionTable.jsx";
import { SHOE_SYSTEMS, dimensionsText, isShoeAxis, labelFor, storedOf } from "../../lib/scaleLabels.js";
import { chooseShoeSystem, readShoeSystem, saveShoeSystem } from "../../lib/shoeSystem.js";
import styles from "./OptionsPicker.module.css";

// More than this many values in a list that is not made of swatches or photos: a dropdown.
const DROPDOWN_OVER = 8;

const cardStatus = (card) => (card.available ? "" : card.status === "out_of_stock" ? t("item.optionSoldOut") : t("item.optionUnavailable"));
// Shown in the buyer's wording when the value is a known scale (1024 GB as "1 TB", a shoe as "EU 42 · UK 8 · US 9 (about 27 cm)", a collar as
// "16 in"); otherwise exactly as the seller wrote it, with "1024 GB" read as "1 TB" as before.
function valueLabelFor(item, axis, system) {
  return (value) => {
    const text = labelFor(item, axis, value, { shoeSystem: system });
    return text === value.label ? formatCapacityLabel(value.label) : text;
  };
}

// The axis the "Size chart" link sits beside: the first one that looks like a size, else the first axis.
const SIZE_AXIS = /size|collar|shoe|waist|fit/i;
export const sizeAxisKey = (axes) => (axes.find((a) => SIZE_AXIS.test(a.key) || SIZE_AXIS.test(a.label ?? "")) ?? axes[0])?.key;

const photoOf = (item, value) => (value.mediaId ? (item.images ?? []).find((m) => m.id === value.mediaId)?.url ?? "" : "");

function Group({ item, option, axis, withChart, system, onSystem }) {
  const valueLabel = valueLabelFor(item, axis, system);
  const shoe = isShoeAxis(item, axis);
  const headId = useId();
  const refs = useRef(new Map());
  const { values, showPrice } = axisCards(option.axes, option.variants, option.choice, axis.key);
  if (values.length === 0) return null;

  const current = option.choice[axis.key];
  const currentLabel = valueLabel(axis.values.find((v) => v.id === current) ?? { label: "" });
  const asSelect = axis.display === "dropdown" || (!["swatch", "image-card"].includes(axis.display) && values.length > DROPDOWN_OVER);
  const money = (n) => kesText(n);

  // "Color: Grey". Polite and atomic: when the choice changes a screen reader says the whole line once, and not on first load.
  const header = (
    <span id={headId} className={styles.header} aria-live="polite" aria-atomic="true">
      {axis.label}: <strong className={styles.value}>{currentLabel}</strong>
    </span>
  );
  // "Size chart" link beside the size selector; hidden when the item has no chart (SizeChartLink returns null).
  const rawCurrent = axis.values.find((v) => v.id === current)?.label ?? "";
  const chartLink = withChart ? <SizeChartLink chart={item.sizeChart} selected={rawCurrent} extra={shoe ? <ShoeConversionTable /> : null} /> : null;
  // The shoe system switch: the buyer's choice is remembered. The selected size does not change, only how it is written.
  const systemSwitch = shoe ? <ShoeSystemSwitch system={system} onChange={onSystem} /> : null;

  if (asSelect) {
    return (
      <div className={styles.group}>
        <p className={styles.live} aria-live="polite" aria-atomic="true">{axis.label}: {currentLabel}</p>
        {chartLink}
        {systemSwitch}
        <OptionSelect
          label={axis.label}
          value={current}
          onChange={(id) => option.select(axis.key, id)}
          items={values.map((card) => ({
            id: card.value.id,
            label: valueLabel(card.value),
            unavailable: !card.available,
            suffix: [showPrice && card.price !== null ? money(card.price) : "", cardStatus(card)].filter(Boolean).join(", ")
          }))}
        />
      </div>
    );
  }

  // Arrow keys move the choice within the group (radio group behaviour): next/previous with wrap, Home and End. The checked card
  // is the only one in the tab order.
  const move = (index, step) => {
    const to = (index + step + values.length) % values.length;
    option.select(axis.key, values[to].value.id);
    refs.current.get(values[to].value.id)?.focus();
  };
  const onKeyDown = (index) => (event) => {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (event.key in keys) {
      event.preventDefault();
      move(index, keys[event.key]);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(event.key === "Home" ? -1 : values.length, event.key === "Home" ? 1 : -1);
    }
  };

  return (
    <div className={styles.group}>
      <p className={styles.headLine}>
        {header}
        {chartLink && <span className={styles.chartSlot}>{chartLink}</span>}
      </p>
      {systemSwitch}
      <div role="radiogroup" aria-labelledby={headId} className={styles.cards}>
        {values.map((card, index) => {
          const value = card.value;
          const selected = value.id === current;
          return (
            <OptionCard
              key={value.id}
              ref={(node) => (node ? refs.current.set(value.id, node) : refs.current.delete(value.id))}
              label={valueLabel(value)}
              selected={selected}
              unavailable={!card.available}
              unavailableText={cardStatus(card)}
              price={showPrice && card.price !== null ? money(card.price) : ""}
              was={showPrice && card.was !== null ? money(card.was) : ""}
              wasLabel={t("item.was")}
              swatch={axis.display === "swatch" ? value.color || "" : ""}
              imageUrl={axis.display === "image-card" ? photoOf(item, value) : ""}
              compact={axis.display === "button" || (axis.display === "dropdown")}
              tabIndex={selected ? 0 : -1}
              onSelect={() => option.select(axis.key, value.id)}
              onKeyDown={onKeyDown(index)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ShoeSystemSwitch({ system, onChange }) {
  const move = (event) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const i = SHOE_SYSTEMS.findIndex((s) => s.id === system);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = SHOE_SYSTEMS[(i + step + SHOE_SYSTEMS.length) % SHOE_SYSTEMS.length].id;
    onChange(next);
    event.currentTarget.querySelector(`[data-system="${next}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={t("item.shoeSystem")} className={styles.systems} onKeyDown={move}>
      {SHOE_SYSTEMS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          data-system={s.id}
          aria-checked={system === s.id}
          tabIndex={system === s.id ? 0 : -1}
          className={system === s.id ? `${styles.system} ${styles.systemOn}` : styles.system}
          onClick={() => onChange(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

// The option groups of an item, one per axis in the seller's order. A dependent axis (Capacity after Style) lists only what exists
// for the choice before it. A combination the seller does not sell can still be picked (it is dashed, not hidden); then the page
// says so and shows no price.
export default function OptionsPicker({ item, option }) {
  const chartAxis = sizeAxisKey(option.axes);
  // The buyer's shoe system (remembered on this device) wins; else the item's own default; else EU.
  const [buyer, setBuyer] = useState(() => readShoeSystem());
  const firstShoe = option.axes.map((a) => a.values?.map((v) => storedOf(item, a, v)).find((v) => v?.scale === "shoe")).find(Boolean);
  const system = chooseShoeSystem(buyer, firstShoe?.system);
  const onSystem = (id) => {
    setBuyer(id);
    saveShoeSystem(id);
  };
  const size = dimensionsText(option.variant?.dimensions);
  return (
    <div className={styles.picker}>
      {option.axes.map((axis) => (
        <Group key={axis.key} item={item} option={option} axis={axis} system={system} onSystem={onSystem} withChart={Boolean(item?.sizeChart) && axis.key === chartAxis} />
      ))}
      {size && (
        <p className={styles.headLine} data-testid="variant-dimensions">
          {t("item.dimensions")}: <strong className={styles.value}>{size}</strong>
        </p>
      )}
      {!option.variant && (
        <p className={styles.note} role="status">
          {t("item.optionNotSold")}
        </p>
      )}
    </div>
  );
}
