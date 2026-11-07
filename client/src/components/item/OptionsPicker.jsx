import { useId, useRef, useState } from "react";
import { OptionCard, OptionSelect } from "@epicmkt/ui";
import { axisCards } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import SizeChartLink from "./SizeChartLink.jsx";
import { kesText } from "../../lib/flash.js";
import { SHOE_SYSTEMS, readShoeSystem, scaleLabel, shoeHelp, variantDimensions, writeShoeSystem } from "../../lib/scaleLabels.js";
import styles from "./OptionsPicker.module.css";

// More than this many values in a list that is not made of swatches or photos: a dropdown.
const DROPDOWN_OVER = 8;

const cardStatus = (card) => (card.available ? "" : card.status === "out_of_stock" ? t("item.optionSoldOut") : t("item.optionUnavailable"));
// Shown from the value's scale when the axis has one ("1024 GB" -> "1 TB", shoes in the buyer's system); else as the seller wrote it.
const valueLabel = (value, axis, system) => scaleLabel(axis, value, { system });
// "Size (EU)" would be wrong once the buyer switches to UK, so the system part of a shoe axis's name goes.
const axisName = (axis, system) => (axis.scale === "shoe" && system ? axis.label.replace(/\s*\((EU|UK|US)[^)]*\)\s*$/i, "") : axis.label);

// The axis a size chart belongs to: the one called Size (or "Shoe size", "Collar size"...). Only that axis gets the link.
const isSizeAxis = (axis) => /size/i.test(axis.key) || /size/i.test(axis.label);

const photoOf = (item, value) => (value.mediaId ? (item.images ?? []).find((m) => m.id === value.mediaId)?.url ?? "" : "");

function ShoeSystemSwitch({ system, onChange }) {
  return (
    <div className={styles.systems} role="group" aria-label={t("item.shoeSystem")}>
      {SHOE_SYSTEMS.map((s) => (
        <button key={s.id} type="button" className={styles.system} aria-pressed={system === s.id} onClick={() => onChange(s.id)}>{s.label}</button>
      ))}
    </div>
  );
}

function Group({ item, option, axis, system, onSystem }) {
  const headId = useId();
  const refs = useRef(new Map());
  const { values, showPrice } = axisCards(option.axes, option.variants, option.choice, axis.key);
  if (values.length === 0) return null;

  const current = option.choice[axis.key];
  const currentValue = axis.values.find((v) => v.id === current) ?? { label: "" };
  const currentLabel = valueLabel(currentValue, axis, system);
  const name = axisName(axis, system);
  const shoe = axis.scale === "shoe";
  const help = shoe ? shoeHelp(axis, currentValue) : "";
  // The shoe switch shows the buyer's system, or the one the value is stored in until they choose.
  const shownSystem = system ?? (shoe ? (currentValue.scaleValue?.system ?? "eu") : null);
  const asSelect = axis.display === "dropdown" || (!["swatch", "image-card"].includes(axis.display) && values.length > DROPDOWN_OVER);
  const money = (n) => kesText(n);
  const chartLink = item.sizeChart && isSizeAxis(axis) ? <SizeChartLink chart={item.sizeChart} /> : null;

  // "Color: Grey". Polite and atomic: when the choice changes a screen reader says the whole line once, and not on first load.
  const header = (
    <span id={headId} className={styles.header} aria-live="polite" aria-atomic="true">
      {name}: <strong className={styles.value}>{currentLabel}</strong>
    </span>
  );

  if (asSelect) {
    return (
      <div className={styles.group}>
        <p className={styles.live} aria-live="polite" aria-atomic="true">{name}: {currentLabel}</p>
        {chartLink}
        {shoe ? <ShoeSystemSwitch system={shownSystem} onChange={onSystem} /> : null}
        <OptionSelect
          label={name}
          value={current}
          onChange={(id) => option.select(axis.key, id)}
          items={values.map((card) => ({
            id: card.value.id,
            label: valueLabel(card.value, axis, system),
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
        {chartLink}
      </p>
      {shoe ? <ShoeSystemSwitch system={shownSystem} onChange={onSystem} /> : null}
      <div role="radiogroup" aria-labelledby={headId} className={styles.cards}>
        {values.map((card, index) => {
          const value = card.value;
          const selected = value.id === current;
          return (
            <OptionCard
              key={value.id}
              ref={(node) => (node ? refs.current.set(value.id, node) : refs.current.delete(value.id))}
              label={valueLabel(value, axis, system)}
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
      {help ? <p className={styles.help}>{help}</p> : null}
    </div>
  );
}

// The option groups of an item, one per axis in the seller's order. A dependent axis (Capacity after Style) lists only what exists
// for the choice before it. A combination the seller does not sell can still be picked (it is dashed, not hidden); then the page
// says so and shows no price.
export default function OptionsPicker({ item, option }) {
  // One shoe system for the whole picker, remembered for this buyer. null = nobody chose yet (the item's default or the stored system shows).
  const [system, setSystem] = useState(() => readShoeSystem());
  const onSystem = (id) => {
    setSystem(id);
    writeShoeSystem(id);
  };
  const dimensions = variantDimensions(option.variant);
  return (
    <div className={styles.picker}>
      {option.axes.map((axis) => (
        <Group key={axis.key} item={item} option={option} axis={axis} system={system} onSystem={onSystem} />
      ))}
      {dimensions ? <p className={styles.dims}><span className={styles.dimsLabel}>{t("item.dimensions")}</span> {dimensions}</p> : null}
      {!option.variant && (
        <p className={styles.note} role="status">
          {t("item.optionNotSold")}
        </p>
      )}
    </div>
  );
}
