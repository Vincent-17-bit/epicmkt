import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronLeft, faChevronRight, faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { searchBusinesses } from "../api/index.js";
import BusinessCard from "./BusinessCard.jsx";
import Button from "./Button.jsx";
import Skeleton from "./Skeleton.jsx";
import styles from "./RecentlyAdded.module.css";

export const RECENT_LIMIT = 12;
export const SEE_ALL_PATH = "/search?sort=newest";

const EDGE_SLACK = 2;

export default function RecentlyAdded() {
  const trackRef = useRef(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["recently-added", RECENT_LIMIT],
    queryFn: () => searchBusinesses({ sort: "newest", pageSize: RECENT_LIMIT }),
    staleTime: 60_000
  });

  const items = data?.items ?? [];
  const total = data?.total ?? items.length;

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setEdge({ start: track.scrollLeft <= EDGE_SLACK, end: track.scrollLeft >= max - EDGE_SLACK });
  }, []);

  useEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure, items.length]);

  const page = (dir) => () => {
    const track = trackRef.current;
    const first = track?.firstElementChild;
    if (!track || !first) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = first.getBoundingClientRect().width + gap;
    const whole = Math.max(1, Math.floor((track.clientWidth + gap) / step));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: dir * whole * step, behavior: reduce ? "auto" : "smooth" });
  };

  if (!isPending && !isError && items.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div className={styles.titles}>
          <h2 id="recent-title" className={styles.title}>
            Recently added
          </h2>
          <p className={styles.sub}>The newest businesses on EpicMKT</p>
        </div>
        <div className={styles.controls}>
          <Link to={SEE_ALL_PATH} className={styles.seeAll}>
            See all
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </Link>
          <div className={styles.arrows}>
            <button type="button" className={styles.arrow} onClick={page(-1)} disabled={edge.start} aria-label="Show previous businesses">
              <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
            </button>
            <button type="button" className={styles.arrow} onClick={page(1)} disabled={edge.end} aria-label="Show next businesses">
              <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {isError ? (
        <div className={styles.error} role="alert">
          <p>We could not load recently added businesses.</p>
          <Button icon={faRotateRight} onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ul
          ref={trackRef}
          className={styles.track}
          onScroll={measure}
          aria-busy={isPending}
          aria-labelledby="recent-title"
        >
          {isPending
            ? Array.from({ length: 6 }, (_, i) => (
                <li key={i} className={styles.slide} aria-hidden="true">
                  <Skeleton height="15.5rem" radius="var(--radius-card)" />
                </li>
              ))
            : items.map((business) => (
                <li key={business.id} className={styles.slide}>
                  <BusinessCard business={business} compact />
                </li>
              ))}
          {!isPending && (
            <li className={styles.slide}>
              <Link to={SEE_ALL_PATH} className={styles.tile}>
                <span className={styles.tileIcon}>
                  <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                </span>
                <span className={styles.tileTitle}>See all</span>
                <span className={styles.tileMeta}>
                  {total} {total === 1 ? "business" : "businesses"}
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
