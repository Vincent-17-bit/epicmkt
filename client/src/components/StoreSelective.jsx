import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { items } from "../api/index.js";
import { t } from "../i18n/index.js";
import ItemCard from "./ItemCard.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./StoreSelective.module.css";

const LIMIT = 12;
const DRAG_THRESHOLD = 5;

export default function StoreSelective({ businessId, businessSlug, excludeItemId, onSelect, onSeeAll }) {
  const rowRef = useRef(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });
  const [edges, setEdges] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["store-selective", businessId, excludeItemId],
    queryFn: () => items.getStoreSelective(businessId, { excludeItemId, limit: LIMIT }),
    staleTime: 30_000
  });

  const measure = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    setEdges({ left: row.scrollLeft > 4, right: row.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    measure();
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure, data]);

  useEffect(() => {
    if (rowRef.current) rowRef.current.scrollLeft = 0;
  }, [excludeItemId]);

  if (!isPending && (!data || data.length < 2)) return null;

  const page = (dir) => () => {
    const row = rowRef.current;
    row?.scrollBy({ left: dir * row.clientWidth, behavior: "smooth" });
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const row = rowRef.current;
    drag.current = { active: true, moved: false, startX: event.clientX, startLeft: row.scrollLeft };
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state.active) return;
    const delta = event.clientX - state.startX;
    if (!state.moved && Math.abs(delta) > DRAG_THRESHOLD) {
      state.moved = true;
      setDragging(true);
    }
    if (state.moved) rowRef.current.scrollLeft = state.startLeft - delta;
  };

  const endDrag = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
  };

  const onClickCapture = (event) => {
    if (!drag.current.moved) return;
    drag.current.moved = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onKeyDown = (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const focusables = [...rowRef.current.querySelectorAll("[data-card], [data-tile]")];
    const index = focusables.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? focusables.length - 1 : index + (event.key === "ArrowRight" ? 1 : -1);
    const target = focusables[Math.min(focusables.length - 1, Math.max(0, next))];
    target.focus({ preventScroll: true });
    target.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  };

  return (
    <section className={styles.section} aria-labelledby="store-selective-title">
      <h3 id="store-selective-title" className={styles.title}>
        {t("item.storeSelective")}
      </h3>
      <div className={styles.frame}>
        <ul
          ref={rowRef}
          className={`${styles.row} ${dragging ? styles.dragging : ""}`}
          data-left={edges.left}
          data-right={edges.right}
          onScroll={measure}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
          onKeyDown={onKeyDown}
          aria-busy={isPending}
        >
          {isPending
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className={styles.cell}>
                  <Skeleton height="12rem" radius="var(--radius-card)" />
                </li>
              ))
            : (
              <>
                {data.map((item, index) => (
                  <li key={item.id} className={styles.cell}>
                    <ItemCard item={item} onSelect={(picked) => onSelect?.(picked, index)} />
                  </li>
                ))}
                <li className={styles.cell}>
                  <Link to={`/b/${businessSlug}`} className={styles.tile} data-tile="" draggable="false" onClick={onSeeAll}>
                    <span>{t("item.seeAll")}</span>
                    <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                  </Link>
                </li>
              </>
            )}
        </ul>
        <button
          type="button"
          className={`${styles.nav} ${styles.prev}`}
          onClick={page(-1)}
          disabled={!edges.left}
          aria-label={t("item.scrollLeft")}
          tabIndex={-1}
        >
          <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.nav} ${styles.next}`}
          onClick={page(1)}
          disabled={!edges.right}
          aria-label={t("item.scrollRight")}
          tabIndex={-1}
        >
          <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
