import { forwardRef } from "react";
import styles from "./OptionCard.module.css";

// One choice in an option group (colour, size, storage, style). A radio button drawn as a card: a colour swatch or a photo above the
// label, or just the label. It carries its own price when the group's prices differ, with the earlier price struck through.
// An unavailable choice (sold out or not sold in this combination) has a dashed border and says so to screen readers, but can still be
// picked: it is never hidden. Place it inside role="radiogroup"; arrow keys are the group's job (the card takes tabIndex for that).
//
//   label        the value's name
//   selected     checked state
//   unavailable  dashed; `unavailableText` is what a screen reader adds ("Currently unavailable")
//   price, was   text, already formatted ("KES 24,000"); `wasLabel` is the screen-reader word for the struck price ("Was")
//   swatch       a CSS colour for a colour card; imageUrl for a photo card; neither for a text card
//   compact      a plain button (no price, no picture) for short lists
const OptionCard = forwardRef(function OptionCard(
  { label, selected = false, unavailable = false, unavailableText = "", price = "", was = "", wasLabel = "", swatch = "", imageUrl = "", compact = false, tabIndex, onSelect, onKeyDown, className = "", ...rest },
  ref
) {
  const kind = imageUrl ? "photo" : swatch ? "swatch" : compact ? "button" : "text";
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      className={`${styles.card} ${className}`}
      data-kind={kind}
      data-selected={selected ? "" : undefined}
      data-unavailable={unavailable ? "" : undefined}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {kind === "photo" && <img className={styles.photo} src={imageUrl} alt="" loading="lazy" />}
      {kind === "swatch" && <span className={styles.swatch} style={{ background: swatch }} aria-hidden="true" />}
      <span className={styles.label}>{label}</span>
      {price && " "}
      {price && (
        <span className={styles.price}>
          {price}
          {was && (
            <s className={styles.was}>
              {wasLabel && <span className="sr-only">{wasLabel}</span>}
              {wasLabel && " "}
              {was}
            </s>
          )}
        </span>
      )}
      {unavailable && unavailableText && " "}
      {unavailable && unavailableText && <span className="sr-only">{unavailableText}</span>}
    </button>
  );
});

export default OptionCard;
