import { useState } from "react";
import { formatKes, offerLabel } from "@epicmkt/shared";
import MediaGallery from "../components/MediaGallery.jsx";
import OfferChip from "../components/OfferChip.jsx";
import StockTag from "../components/StockTag.jsx";
import { dedupeDescription } from "../lib/media.js";
import ItemDescription from "./ItemDescription.jsx";
import ItemSpecs from "./ItemSpecs.jsx";
import { HIGHLIGHT_LIMIT, buildSpecGroups, normalizeHighlights } from "./itemView.js";
import { itemT } from "./labels.js";
import styles from "./ItemView.module.css";

const galleryLabels = (t) => ({
  gallery: t("item.gallery"),
  choose: t("item.chooseMedia"),
  photo: t("item.photo"),
  video: t("item.video"),
  zoom: t("item.zoom"),
  play: t("video.playStage"),
  pause: t("video.pauseStage"),
  soundOn: t("video.soundOn"),
  soundOff: t("video.soundOff"),
  previous: t("item.prev"),
  next: t("item.next"),
  position: t("item.mediaPosition"),
  videoError: t("video.error"),
  slide: t("item.slide"),
  carousel: t("item.carousel")
});

function Highlights({ items, onMore, t }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, HIGHLIGHT_LIMIT);
  return (
    <section className={styles.about} aria-labelledby="item-about">
      <h3 id="item-about" className={styles.aboutTitle}>
        {t("item.highlights")}
      </h3>
      <ul className={styles.bullets}>
        {shown.map((entry, index) => (
          <li key={index} className={styles.bullet}>
            {entry.title && <strong className={styles.lead}>{entry.title} </strong>}
            {entry.text}
          </li>
        ))}
      </ul>
      <div className={styles.aboutActions}>
        {items.length > HIGHLIGHT_LIMIT && (
          <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("item.showLess") : t("item.showAll")}
          </button>
        )}
        {onMore && (
          <button type="button" className={styles.moreLink} onClick={onMore}>
            {t("item.moreDetails")}
          </button>
        )}
      </div>
    </section>
  );
}

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
  className = ""
}) {
  const variants = item.pricing?.variants ?? [];
  const highlights = normalizeHighlights(item.highlights);
  const fullDescription = dedupeDescription(item.shortDescription, item.description);
  const hasSpecs = buildSpecGroups({ item, category, attributes }).length > 0;
  const [pinged, setPinged] = useState(0);
  const reveal = pinged;
  return (
    <div className={`${styles.layout} ${className}`} data-variant={layout}>
      <div className={styles.media}>
        <MediaGallery key={`gallery-${item.id}`} media={item.media} images={item.images} videos={item.videos} name={item.name} labels={galleryLabels(t)} />
      </div>
      <div className={styles.content}>
        <div className={styles.details}>
          {flash}

          <div className={styles.info}>
            {item.brand && <p className={styles.brand}>{item.brand}</p>}
            <Heading id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
              {item.name}
            </Heading>
            {item.shortDescription && <p className={styles.description}>{item.shortDescription}</p>}

            {shown && !item.flash && (
              <div className={styles.priceBlock}>
                {shown.savings > 0 ? (
                  <>
                    <p className={styles.salePrice}>
                      {formatKes(shown.salePrice)}
                      {item.pricing.unit && <span className={styles.unit}> / {item.pricing.unit}</span>}
                      <span className={styles.saleChip}>
                        {t("item.sale")} -{shown.discountPercent}%
                      </span>
                    </p>
                    <p className={styles.was}>
                      <s>
                        <span className="sr-only">{t("item.was")} </span>
                        {formatKes(shown.regularPrice)}
                      </s>
                      <span>
                        {t("item.save")} {formatKes(shown.savings)}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className={styles.price}>
                    {formatKes(shown.regularPrice)}
                    {item.pricing.unit && <span className={styles.unit}> / {item.pricing.unit}</span>}
                  </p>
                )}
              </div>
            )}

            {variants.length > 0 && (
              <div role="radiogroup" aria-label={t("item.options")} className={styles.variants}>
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={v.id === activeId}
                    className={`${styles.variant} ${v.id === activeId ? styles.selected : ""}`}
                    onClick={() => onVariant?.(v.id)}
                  >
                    {v.label}
                    {item.flash && <span className={styles.variantPrice}>{money(v.salePrice)}</span>}
                  </button>
                ))}
              </div>
            )}

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

          {highlights.length > 0 && (
            <Highlights key={`highlights-${item.id}`} items={highlights} onMore={hasSpecs ? () => setPinged((n) => n + 1) : undefined} t={t} />
          )}

          {fullDescription && <ItemDescription key={`description-${item.id}`} text={fullDescription} t={t} />}

          {after}
        </div>

        <div className={styles.panels}>
          <ItemSpecs key={`specs-${item.id}`} item={item} category={category} attributes={attributes} reveal={reveal} onExpand={onExpandSpec} t={t} />
        </div>
      </div>
    </div>
  );
}
