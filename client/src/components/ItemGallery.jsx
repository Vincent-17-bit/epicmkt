import { useRef, useState } from "react";
import { t } from "../i18n/index.js";
import Lightbox from "./Lightbox.jsx";
import styles from "./ItemGallery.module.css";

export default function ItemGallery({ images, name }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  const goTo = (index) => {
    const track = trackRef.current;
    track?.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
    setActive(index);
  };

  if (!images.length) return null;

  return (
    <div className={styles.gallery}>
      <div ref={trackRef} className={styles.track} onScroll={onScroll} role="group" aria-label={name}>
        {images.map((image, index) => (
          <button
            key={image.id}
            type="button"
            className={styles.slide}
            onClick={() => setZoom(index)}
            aria-label={`${t("item.zoom")} ${index + 1} / ${images.length}`}
          >
            <img
              src={image.url}
              alt=""
              className={styles.img}
              decoding="async"
              loading={index === 0 ? "eager" : "lazy"}
              draggable="false"
            />
          </button>
        ))}
      </div>
      {images.length > 1 && (
        <ul className={styles.thumbs}>
          {images.map((image, index) => (
            <li key={image.id}>
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
      )}
      <Lightbox items={images} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
    </div>
  );
}
