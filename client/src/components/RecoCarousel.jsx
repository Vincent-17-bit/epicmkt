import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Skeleton } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import { scrollBehavior } from "../lib/motion.js";
import ProductTile from "./ProductTile.jsx";
import styles from "./RecoCarousel.module.css";

/**
 * A row of product cards for the end of the item page ("Goes well with this", "Similar items"): a title on the left, "Page 2 of 7"
 * on the right, round arrows at the sides that move a whole page, and swipe or drag on a phone. Each card is the site's one
 * product card (ProductTile). There are no reviews or ratings on EpicMKT, so none are shown.
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

/**
 * One card: the site's product card (the same one as the home grid and search), with "From this shop" on the picture for an
 * item of the shop being viewed, and the shop's town under the price. The whole card is one link (one stop for the keyboard).
 */
export function RecoCard({ item }) {
  const shop = item.business ?? {};
  const place = shop.town || shop.county || "";
  return (
    <article className={styles.card}>
      <ProductTile item={item} tag={item.fromThisShop ? t("reco.fromThisShop") : null} delivery={place ? { kind: "place", text: place } : null} />
    </article>
  );
}
