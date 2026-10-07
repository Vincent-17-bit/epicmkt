import { useRef } from "react";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import BusinessCard from "./BusinessCard.jsx";
import { IconButton } from "@epicmkt/ui";
import styles from "./BusinessRail.module.css";

export default function BusinessRail({ items, label }) {
  const trackRef = useRef(null);

  const scroll = (dir) => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={styles.rail} role="region" aria-label={label}>
      <div className={styles.nav}>
        <IconButton icon={faChevronLeft} label="Previous" onClick={() => scroll(-1)} />
        <IconButton icon={faChevronRight} label="Next" onClick={() => scroll(1)} />
      </div>
      <ul ref={trackRef} className={styles.track} tabIndex={0}>
        {items.map((business) => (
          <li key={business.id} className={styles.slide}>
            <BusinessCard business={business} />
          </li>
        ))}
      </ul>
    </div>
  );
}
