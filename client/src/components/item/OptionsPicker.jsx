import { useId, useRef } from "react";
import { OptionCard, OptionSelect } from "@epicmkt/ui";
import { axisCards, formatCapacityLabel } from "@epicmkt/shared";
import { t } from "../../i18n/index.js";
import { kesText } from "../../lib/flash.js";
import styles from "./OptionsPicker.module.css";

// More than this many values in a list that is not made of swatches or photos: a dropdown.
const DROPDOWN_OVER = 8;

const cardStatus = (card) => (card.available ? "" : card.status === "out_of_stock" ? t("item.optionSoldOut") : t("item.optionUnavailable"));
// "1024 GB" is read as "1 TB"; everything else is shown as the seller wrote it.
const valueLabel = (value) => formatCapacityLabel(value.label);

const photoOf = (item, value) => (value.mediaId ? (item.images ?? []).find((m) => m.id === value.mediaId)?.url ?? "" : "");

function Group({ item, option, axis }) {
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

  if (asSelect) {
    return (
      <div className={styles.group}>
        <p className={styles.live} aria-live="polite" aria-atomic="true">{axis.label}: {currentLabel}</p>
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
      <p className={styles.headLine}>{header}</p>
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

// The option groups of an item, one per axis in the seller's order. A dependent axis (Capacity after Style) lists only what exists
// for the choice before it. A combination the seller does not sell can still be picked (it is dashed, not hidden); then the page
// says so and shows no price.
export default function OptionsPicker({ item, option }) {
  return (
    <div className={styles.picker}>
      {option.axes.map((axis) => (
        <Group key={axis.key} item={item} option={option} axis={axis} />
      ))}
      {!option.variant && (
        <p className={styles.note} role="status">
          {t("item.optionNotSold")}
        </p>
      )}
    </div>
  );
}
