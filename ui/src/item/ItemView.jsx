import { useState } from "react";
import { formatKes, offerLabel } from "@epicmkt/shared";
import OfferChip from "../components/OfferChip.jsx";
import StockTag from "../components/StockTag.jsx";
import ItemDetails from "./ItemDetails.jsx";
import ItemGallery from "./ItemGallery.jsx";
import ItemHeader from "./ItemHeader.jsx";
import ItemOptions from "./ItemOptions.jsx";
import ItemSpecs from "./ItemSpecs.jsx";
import { buildSpecGroups } from "./itemView.js";
import { itemT } from "./labels.js";
import styles from "./ItemView.module.css";

// The item page body. Each part is its own component (ItemGallery, ItemHeader, ItemOptions, ItemDetails, ItemSpecs) and ItemView
// puts them where they go. A caller can replace a part with the slot props `gallery`, `header`, `options`, `details` and `specs`:
// leave a prop out (undefined) for today's markup, pass any node (null and false included) to draw that part itself, or pass a
// function that gets the props the default part would have received and returns the node (the specs table needs `reveal`, and the
// details need `onMoreSpecs`, which ItemView owns). The wrappers that place a part in the layout stay, so a replaced part cannot
// break the layout.
// Props flash, offers, seller and after are the older slots for what sits around those parts.

const fill = (slot, props, Default, key) => (slot === undefined ? <Default key={key} {...props} /> : typeof slot === "function" ? slot(props) : slot);

export default function ItemView({
  item,
  shown,
  activeId = null,
  onVariant,
  layout = "sheet",
  t = itemT,
  category,
  attributes,
  onExpandSpec,
  Heading = "h2",
  headingRef,
  headingId = "item-title",
  money = formatKes,
  flash = null,
  offers = null,
  seller = null,
  after = null,
  gallery,
  header,
  options,
  details,
  specs,
  className = "",
  marks
}) {
  const hasSpecs = buildSpecGroups({ item, category, attributes }).length > 0;
  const [pinged, setPinged] = useState(0);
  const reveal = pinged;
  const mark = (part) => marks?.(part);
  return (
    <div className={`${styles.layout} ${className}`} data-variant={layout}>
      <div className={styles.media} data-hl={mark("media")}>
        {fill(gallery, { item, t }, ItemGallery)}
      </div>
      <div className={styles.content}>
        <div className={styles.details}>
          {flash}

          <div className={styles.info}>
            {fill(header, { item, shown, t, Heading, headingRef, headingId, marks }, ItemHeader)}

            {fill(options, { item, activeId, onVariant, t, money }, ItemOptions)}

            {item.availability === "limited_stock" && <StockTag item={item} labels={{ lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft") }} className={styles.stockTag} />}
            {item.availability === "by_appointment" && <p className={styles.availability}>{t("item.availability.by_appointment")}</p>}
            {item.packSize && (
              <p className={styles.packSize}>
                <span className={styles.packLabel}>{t("item.packSize")}:</span> {item.packSize}
              </p>
            )}

            {offers}

            {(item.section || item.offers.length > 0) && (
              <div className={styles.badges}>
                {item.section && <span className={styles.tag}>{item.section}</span>}
                {item.offers.length > 0 && (
                  <OfferChip
                    offer={{ label: offerLabel(item.offers[0].offer), extra: item.offers.length - 1 }}
                    className={styles.offerBadge}
                    labels={{ offer: t("offer.chip"), more: t("offer.more") }}
                  />
                )}
              </div>
            )}
          </div>

          {seller}

          {fill(details, { item, t, marks, onMoreSpecs: hasSpecs ? () => setPinged((n) => n + 1) : undefined }, ItemDetails)}

          {after}
        </div>

        <div className={styles.panels} data-hl={mark("specs")}>
          {fill(specs, { item, category, attributes, reveal, onExpand: onExpandSpec, t }, ItemSpecs, `specs-${item.id}`)}
        </div>
      </div>
    </div>
  );
}
