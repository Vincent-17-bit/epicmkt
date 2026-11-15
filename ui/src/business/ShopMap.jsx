import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot } from "@fortawesome/free-solid-svg-icons";
import { mapSrc } from "./groupServices.js";
import styles from "./ShopMap.module.css";

/**
 * The map of where a shop is: an OpenStreetMap view with our own pin on top, in a fixed-ratio box so nothing moves while
 * it loads. One component for the shop page (interactive) and the item page (a still picture: `interactive={false}` makes
 * it inert, so it takes no focus and cannot trap scrolling; the caller adds "View larger map" and the words for screen
 * readers). The map is only requested when the box comes near the screen.
 */
export default function ShopMap({ name, lat, lng, interactive = true, className = "" }) {
  const box = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (!node || near) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "300px" });
    io.observe(node);
    return () => io.disconnect();
  }, [near]);
  return (
    <div ref={box} className={`${styles.map} ${interactive ? "" : styles.still} ${className}`} {...(interactive ? {} : { "aria-hidden": "true" })}>
      {near && (
        <iframe
          title={`Map showing ${name}`}
          src={mapSrc(lat, lng)}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={styles.frame}
          tabIndex={interactive ? undefined : -1}
          {...(interactive ? {} : { inert: "" })}
        />
      )}
      {!interactive && (
        <span className={styles.pin} aria-hidden="true">
          <FontAwesomeIcon icon={faLocationDot} />
        </span>
      )}
    </div>
  );
}
