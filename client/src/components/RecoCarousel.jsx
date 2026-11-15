import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { Skeleton, VerifiedMark, coverUrl } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import { scrollBehavior } from "../lib/motion.js";
import { itemPagePath } from "./ProductTile.jsx";
import styles from "./RecoCarousel.module.css";

/**
 * A row of product cards for the end of the item page ("Goes well with this", "Similar items"): a title on the left, "Page 2 of 7"
 * on the right, round arrows at the sides that move a whole page, and swipe or drag on a phone. Each card is the product's
 * picture, its name as a link, the price (with the regular price struck through on an offer), and the shop with its town. There
 * are no reviews or ratings on EpicMKT, so none are shown.
 *
 * The row only moves when the visitor moves it: no autoplay, no reshuffling while it is on screen.
 */
export default function RecoCarousel({ id, title, note = "", rows, loading = false, onOpen, className = "", dataAttr = {} }) {
  const track = useRef(null);
  const [pos, setPos] = useState({ page: 1, pages: 1, start: true, end: true });

  const measure = useCallback(() => {
    const row = track.current;
    if (!row) return;
    const width = row.clientWidth || 1;
    const max = Math.max(0, row.scrollWidth - width);
    const pages = Math.max(1, Math.ceil((row.scrollWidth - 2) / width));
    const page = row.scrollLeft >= max - 2 ? pages : Math.min(pages, Math.floor((row.scrollLeft + 2) / width) + 1);
    setPos((p) => (p.page === page && p.pages === pages && p.start === row.scrollLeft <= 2 && p.end === row.scrollLeft >= max - 2 ? p : { page, pages, start: row.scrollLeft <= 2, end: row.scrollLeft >= max - 2 }));
  }, []);

  useEffect(() => {
    measure();
    const row = track.current;
    if (!row || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, rows.length, loading]);

  const move = (dir) => () => {
    const row = track.current;
    row?.scrollBy({ left: dir * row.clientWidth, behavior: scrollBehavior() });
  };

  const titleId = `${id}-title`;
  return (
    <section id={id} className={`${styles.section} ${className}`} aria-labelledby={titleId} aria-busy={loading || undefined} {...dataAttr}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h3 id={titleId} className={styles.title}>{title}</h3>
          {note && <p className={styles.note}>{note}</p>}
        </div>
        {!loading && pos.pages > 1 && (
          <p className={styles.pageOf}>
            {t("reco.pageOf").replace("{page}", String(pos.page)).replace("{pages}", String(pos.pages))}
          </p>
        )}
      </div>
      <div className={styles.frame}>
        <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={move(-1)} disabled={loading || pos.start} aria-label={t("reco.previous").replace("{what}", title)} aria-controls={`${id}-track`}>
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <ul id={`${id}-track`} ref={track} className={styles.track} onScroll={measure}>
          {loading
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className={styles.cell} aria-hidden="true">
                  <Skeleton height="auto" radius="var(--radius-card)" className={styles.skeleton} />
                  <Skeleton height="1rem" width="85%" />
                  <Skeleton height="1rem" width="55%" />
                </li>
              ))
            : rows.map((row, index) => (
                <li key={row.id} className={styles.cell} onClick={() => onOpen?.(row, index)}>
                  <RecoCard item={row} />
                </li>
              ))}
        </ul>
        <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={move(1)} disabled={loading || pos.end} aria-label={t("reco.next").replace("{what}", title)} aria-controls={`${id}-track`}>
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
    </section>
  );
}

/** One card: picture, name, price, shop. The picture and the name are one link (one stop for the keyboard). */
export function RecoCard({ item }) {
  const href = itemPagePath(item);
  const p = item.pricing ?? {};
  const ranged = Boolean(p.hasRange && Number.isFinite(p.priceMin));
  const price = ranged ? p.priceMin : p.salePrice ?? p.regularPrice ?? item.price;
  const onSale = !ranged && p.savings > 0 && Number.isFinite(p.regularPrice);
  const shop = item.business ?? {};
  const place = shop.town || shop.county || "";
  const status = shop.isOpen === false ? t("item.closed") : "";
  return (
    <article className={styles.card}>
      <Link to={href} className={styles.link}>
        <span className={styles.media}>
          <img src={coverUrl(item) || undefined} alt="" loading="lazy" decoding="async" className={styles.img} />
          {item.flash?.sale && <span className={styles.flash}>{t("reco.flash")}</span>}
        </span>
        {item.fromThisShop && <span className={styles.mine}>{t("reco.fromThisShop")}</span>}
        <span className={styles.name}>{item.name}</span>
      </Link>
      {Number.isFinite(price) && (
        <p className={styles.priceLine}>
          {onSale && <span className={styles.off}>-{p.discountPercent}%</span>}
          {ranged && <span className={styles.from}>{t("item.from")} </span>}
          <span className={styles.price}>{formatKes(price)}</span>
        </p>
      )}
      {onSale && (
        <p className={styles.was}>
          {t("reco.was")} <s>{formatKes(p.regularPrice)}</s>
        </p>
      )}
      <p className={styles.shop}>
        <span className={styles.shopName}>{shop.name}</span>
        {shop.verified && <VerifiedMark label={t("home.verifiedStore")} />}
      </p>
      {(place || status) && (
        <p className={styles.meta}>
          {place}
          {place && status ? " · " : ""}
          {status && <span className={styles.closed}>{status}</span>}
        </p>
      )}
    </article>
  );
}
