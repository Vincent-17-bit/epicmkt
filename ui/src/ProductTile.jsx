import { formatKes, isListed } from "@epicmkt/shared";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot, faPlay, faTruck } from "@fortawesome/free-solid-svg-icons";
import { isPreview } from "./preview.js";
import OfferChip from "./components/OfferChip.jsx";
import { FeaturedMark, VerifiedMark } from "./components/Marks.jsx";
import { cardBlurb, coverUrl } from "./lib/media.js";
import LazyImage from "./components/LazyImage.jsx";
import StockTag from "./components/StockTag.jsx";
import styles from "./ProductTile.module.css";

const DEFAULT_LABELS = {
  was: "Was",
  verified: "Verified store",
  featured: "Featured store",
  offerChip: { offer: "Offer", more: "more" },
  from: "From",
  options: "Options",
  optionsOne: "1 option",
  optionsMany: "{n} options",
  closed: "Closed",
  open: "Open now",
  lowStock: "Low stock",
  onlyLeft: "Only {n} left",
  colours: "{n} colours",
  videos: "Has video",
  ask: "Ask for the price"
};

const plainLink = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

const inertLink = ({ href, children, ...rest }) => (
  <a aria-disabled="true" {...rest}>
    {children}
  </a>
);

const SWATCHES = 5;

/**
 * The one product card of the site: home lists, search results, "Goes well with", similar items. Every card has the same
 * shape: a square picture, then the name (always the same number of lines, so prices line up across a row), an optional
 * line of facts, the colours, the price at the foot, and the shop. The whole card is one link; the shop name is text.
 *
 * Optional, for search results (all of it read from the product, nothing invented):
 *   facts      ["30 W", "12 h playtime"]  one muted line under the name
 *   swatches   [{ label, color }]        up to five dots and "+3"
 *   delivery   { kind: "delivery" | "pickup" | "place", text }   a truck for delivery, a pin otherwise
 *   cta        "See options"             a quiet button at the foot (hidden on narrow cards)
 *   titleLines 2 (default) or 3;  blurb false hides the short description after the name;  priority loads the picture first
 *   onClick    called when the card is opened (search logs the position)
 *
 * Availability: an available item shows nothing extra, one running low gets "Low stock" / "Only 3 left" on the picture, and a
 * sold-out item is not drawn at all (sold-out items are not listed to customers, so one reaching here is a bug elsewhere).
 */
export default function ProductTile({
  item,
  href,
  renderLink = plainLink,
  labels = DEFAULT_LABELS,
  renderFlash,
  mode = "live",
  facts = null,
  swatches = null,
  delivery = null,
  cta = null,
  titleLines = 2,
  blurb: showBlurb = true,
  priority = false,
  onClick,
  className = ""
}) {
  const preview = isPreview(mode);
  const Link = preview ? inertLink : renderLink;
  const text = { ...DEFAULT_LABELS, ...labels };
  const store = item.business ?? {};
  const pricing = item.pricing;
  const onSale = Boolean(pricing && pricing.savings > 0);
  // Combinations priced differently: "From KES 24,000" (the lowest price now; with a flash sale running, the lowest flash price).
  // A strike-through regular price would be the wrong comparison against a lowest price, so it is left out then, and so is the
  // "-33%" badge: each option is discounted differently (or not at all), so one percentage would be wrong for most of them.
  const ranged = Boolean(pricing?.hasRange && Number.isFinite(pricing.priceMin));
  const count = Number(item.optionCount);
  const optionsText = !item.hasOptions ? "" : count === 1 ? text.optionsOne : count > 1 ? text.optionsMany.replace("{n}", String(count)) : text.options;
  // A short line after the name, sharing the name's lines: it fills the space a short name leaves and is cut when long.
  const blurb = showBlurb ? cardBlurb(item) || String(item.section ?? "").trim() : "";
  const dots = Array.isArray(swatches) ? swatches.filter((s) => s?.label) : [];
  const hasVideo = (item.videos?.length ?? 0) > 0 || (item.media ?? []).some((m) => m?.kind === "video");
  const amount = pricing ? (ranged ? pricing.priceMin : pricing.salePrice) : null;

  if (!isListed(item)) return null;

  return (
    <Link href={preview ? undefined : href} className={`${styles.tile} ${className}`} data-mode={preview ? "preview" : undefined} style={{ "--title-lines": titleLines }} onClick={preview ? undefined : onClick}>
      <span className={styles.media}>
        <LazyImage fill src={coverUrl(item)} className={styles.img} priority={priority} />
        {onSale && !ranged && <span className={styles.sale}>-{pricing.discountPercent}%</span>}
        {item.flash?.sale && renderFlash?.(styles.flash)}
        <OfferChip offer={item.offer} className={styles.offer} labels={text.offerChip} />
        <StockTag item={item} labels={text} className={styles.stockTag} onPicture lifted={Boolean(item.flash?.sale)} />
        {hasVideo && (
          <span className={styles.video} title={text.videos}>
            <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
            <span className="sr-only">{text.videos}</span>
          </span>
        )}
      </span>

      <span className={styles.body}>
        <span className={styles.copy}>
          <span className={styles.name}>{item.name}</span>
          {blurb && <span className={styles.blurb}>{blurb}</span>}
        </span>
        {facts?.length > 0 && <span className={styles.facts}>{facts.join(" · ")}</span>}
        {(dots.length > 1 || optionsText) && (
          <span className={styles.variants}>
            {dots.length > 1 ? (
              <span className={styles.dots} role="img" aria-label={text.colours.replace("{n}", String(dots.length))}>
                {dots.slice(0, SWATCHES).map((s) => (
                  <span key={s.id ?? s.label} className={styles.dot} style={{ "--sw": s.color ?? "var(--surface-3)" }} title={s.label} />
                ))}
                {dots.length > SWATCHES && <span className={styles.moreDots}>+{dots.length - SWATCHES}</span>}
              </span>
            ) : null}
            {optionsText && <span className={styles.options}>{optionsText}</span>}
          </span>
        )}

        <span className={styles.foot}>
          {pricing ? (
            <span className={styles.prices}>
              {ranged && <span className={styles.from}>{text.from}</span>}
              {ranged && " "}
              <span className={styles.price}>
                <span className={styles.cur}>KES</span>
                <span className="sr-only"> </span>
                {formatKes(amount).replace(/^KES\s?/, "")}
                {item.unit && <span className={styles.unit}>/{item.unit}</span>}
              </span>
              {onSale && !ranged && (
                <s className={styles.was}>
                  <span className="sr-only">{text.was} </span>
                  {formatKes(pricing.regularPrice)}
                </s>
              )}
            </span>
          ) : (
            <span className={styles.ask}>{text.ask}</span>
          )}
          {delivery?.text && (
            <span className={styles.delivery} data-kind={delivery.kind}>
              <FontAwesomeIcon icon={delivery.kind === "delivery" ? faTruck : faLocationDot} aria-hidden="true" className={styles.lineIcon} />
              <span className={styles.lineText}>{delivery.text}</span>
            </span>
          )}
          <span className={styles.store}>
            {store.featured && <FeaturedMark label={text.featured} />}
            <span className={styles.storeName}>{store.name}</span>
            {store.verified && <VerifiedMark label={text.verified} />}
            {store.isOpen === false && (
              <span className={styles.closed} title={store.statusLine ?? undefined}>
                {text.closed}
              </span>
            )}
            {store.isOpen === true && <span className={styles.openDot} title={text.open} aria-label={text.open} role="img" />}
          </span>
          {cta && <span className={styles.cta} aria-hidden="true">{cta}</span>}
        </span>
      </span>
    </Link>
  );
}
