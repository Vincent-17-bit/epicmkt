import { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faLocationDot, faStore, faTruck } from "@fortawesome/free-solid-svg-icons";
import styles from "./ProductSearch.module.css";

const SWATCHES = 6;
const kes = (n) => Math.round(n).toLocaleString("en-KE");
export const itemHref = (item, valueId = null) => `/b/${item.business?.slug ?? item.businessSlug}/i/${encodeURIComponent(item.id)}${valueId ? `?v=${encodeURIComponent(valueId)}` : ""}`;

function Price({ item }) {
  const price = item.search?.price;
  if (price === null || price === undefined) return <p className={styles.ask}>Ask the shop for the price</p>;
  const regular = item.pricing?.regularPrice;
  const from = Boolean(item.priceRange) || item.priceType === "from";
  const was = !from && Number.isFinite(regular) && regular > price ? regular : null;
  return (
    <p className={styles.price}>
      {from && <span className={styles.from}>From </span>}
      <span className={styles.cur}>KES</span>
      <span className={styles.amount}>{kes(price)}</span>
      {item.unit && <span className={styles.unit}> / {item.unit}</span>}
      {was && (
        <span className={styles.was}>
          {" "}Was: <s>KES {kes(was)}</s>
        </span>
      )}
      {item.pricing?.discountPercent > 0 && !from && <span className={styles.save}> -{item.pricing.discountPercent}%</span>}
    </p>
  );
}

function DeliveryLine({ item }) {
  const d = item.business?.delivery;
  if (d?.offers) {
    const fee = Number.isFinite(d.fee) ? (d.fee === 0 ? "Free delivery" : `Delivery KES ${kes(d.fee)}`) : "Delivery available";
    return (
      <p className={styles.delivery}>
        <FontAwesomeIcon icon={faTruck} aria-hidden="true" /> <strong>{fee}</strong>
        {d.radiusKm ? ` within ${d.radiusKm} km` : ""}
        {d.area ? ` · ${d.area}` : ""}
      </p>
    );
  }
  return (
    <p className={styles.pickup}>
      <FontAwesomeIcon icon={faLocationDot} aria-hidden="true" /> Pick up from the shop{item.business?.town ? `, ${item.business.town}` : ""}
    </p>
  );
}

/** One result, as a wide row: picture on the left, the facts a buyer compares on the right. No cart: "See options" opens the item. */
export default function ResultRow({ item, position, onOpen }) {
  const swatches = item.swatches ?? [];
  const [preview, setPreview] = useState(null);
  const image = preview?.imageUrl ?? item.imageUrl ?? item.images?.[0]?.url ?? null;
  const single = (item.optionValues ?? []).every((v) => /^Colou?r:/i.test(v));
  const href = itemHref(item, preview && single ? preview.id : null);
  const badge = item.flash ? { text: "Flash sale", tone: "flash" } : item.business?.featured ? { text: "Featured shop", tone: "dark" } : item.pricing?.discountPercent > 0 ? { text: "On sale", tone: "sale" } : null;
  const titleId = `r-${item.id}`;
  return (
    <li className={styles.row}>
      <Link to={href} className={styles.media} tabIndex={-1} aria-hidden="true" onClick={() => onOpen?.(item, position)}>
        {badge && <span className={styles.badge} data-tone={badge.tone}>{badge.text}</span>}
        {image ? <img src={image} alt="" loading={position > 2 ? "lazy" : "eager"} decoding="async" className={styles.img} /> : <span className={styles.noimg} />}
      </Link>
      <div className={styles.body}>
        <h2 className={styles.title}>
          <Link id={titleId} to={href} onClick={() => onOpen?.(item, position)}>
            {item.name}
          </Link>
        </h2>
        {item.shortDescription && item.shortDescription !== item.name && <p className={styles.sub}>{item.shortDescription}</p>}
        {item.search?.facts?.length > 0 && <p className={styles.facts}>{item.search.facts.join(" · ")}</p>}
        <p className={styles.seller}>
          <FontAwesomeIcon icon={faStore} aria-hidden="true" /> Sold by{" "}
          <Link to={`/b/${item.business?.slug}`} className={styles.shopLink}>{item.business?.name}</Link>
          {item.business?.verified && <FontAwesomeIcon icon={faCircleCheck} className={styles.verified} title="Verified shop" aria-label="Verified shop" />}
          {item.business?.town ? ` · ${item.business.town}` : ""}
          <span className={item.business?.isOpen ? styles.open : styles.closed}>{item.business?.isOpen ? " · Open now" : " · Closed now"}</span>
        </p>
        <Price item={item} />
        <DeliveryLine item={item} />
        <Link to={href} className={styles.cta} onClick={() => onOpen?.(item, position)}>
          {item.hasOptions ? "See options" : "View item"}
        </Link>
        {swatches.length > 1 && (
          <div className={styles.rowSwatches} role="group" aria-label={`${swatches.length} colours`}>
            {swatches.slice(0, SWATCHES).map((s) => (
              <button
                key={s.id}
                type="button"
                className={styles.dot}
                style={{ "--sw": s.color ?? "#ccc" }}
                aria-pressed={(preview?.id ?? swatches[0].id) === s.id}
                aria-label={s.label}
                title={s.label}
                onMouseEnter={() => setPreview(s)}
                onFocus={() => setPreview(s)}
                onClick={() => setPreview(s)}
              />
            ))}
            {swatches.length > SWATCHES && (
              <Link to={href} className={styles.moreSw} aria-label={`${swatches.length - SWATCHES} more colours`}>
                +{swatches.length - SWATCHES}
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
