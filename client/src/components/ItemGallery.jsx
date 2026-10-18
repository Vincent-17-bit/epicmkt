import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage } from "@fortawesome/free-solid-svg-icons";
import { motionAllowed } from "../lib/motion.js";
import { t } from "../i18n/index.js";
import Lightbox from "./Lightbox.jsx";
import styles from "./ItemGallery.module.css";

const behavior = () => (motionAllowed() ? "smooth" : "auto");

function scrollRow(node, left) {
  if (!node) return;
  if (typeof node.scrollTo === "function") node.scrollTo({ left, behavior: behavior() });
  else node.scrollLeft = left;
}

export default function ItemGallery({ images, name }) {
  const trackRef = useRef(null);
  const thumbsRef = useRef(null);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);
  const count = images.length;

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    setActive(Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / track.clientWidth))));
  };

  const goTo = (index) => {
    const next = Math.min(count - 1, Math.max(0, index));
    const track = trackRef.current;
    if (track) scrollRow(track, next * track.clientWidth);
    setActive(next);
  };

  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[active];
    if (!strip || !thumb) return;
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    scrollRow(strip, Math.max(0, left));
  }, [active]);

  const onKeyDown = (event) => {
    if (event.key === "ArrowLeft") goTo(active - 1);
    else if (event.key === "ArrowRight") goTo(active + 1);
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(count - 1);
    else return;
    event.preventDefault();
  };

  if (!count) {
    return (
      <div className={styles.gallery}>
        <div className={styles.stage}>
          <span className={styles.empty} aria-hidden="true">
            <FontAwesomeIcon icon={faImage} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.gallery}>
      <div className={styles.stage}>
        <div
          ref={trackRef}
          className={styles.track}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          role="group"
          aria-roledescription="carousel"
          aria-label={name}
        >
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={styles.slide}
              onClick={() => setZoom(index)}
              aria-label={`${t("item.zoom")} ${index + 1} ${t("item.of")} ${count}`}
            >
              <img
                src={image.url}
                alt=""
                className={styles.img}
                decoding="async"
                loading={index === 0 ? "eager" : "lazy"}
                {...(index === 0 ? { fetchpriority: "high" } : {})}
                draggable="false"
              />
            </button>
          ))}
        </div>
        {count > 1 && (
          <span className={styles.counter} aria-hidden="true">
            {active + 1} / {count}
          </span>
        )}
      </div>

      {count > 1 && (
        <>
          <ul className={styles.dots} aria-hidden="true">
            {images.map((image, index) => (
              <li key={image.id} className={`${styles.dot} ${index === active ? styles.dotActive : ""}`} />
            ))}
          </ul>
          <ul ref={thumbsRef} className={styles.thumbs} onKeyDown={onKeyDown}>
            {images.map((image, index) => (
              <li key={image.id} className={styles.thumbCell}>
                <button
                  type="button"
                  className={`${styles.thumb} ${index === active ? styles.current : ""}`}
                  onClick={() => goTo(index)}
                  aria-label={`${t("item.photo")} ${index + 1}`}
                  aria-current={index === active ? "true" : undefined}
                >
                  <img src={image.url} alt="" className={styles.thumbImg} loading="lazy" decoding="async" draggable="false" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Lightbox items={images} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
    </div>
  );
}
