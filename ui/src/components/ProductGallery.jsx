import { useRef, useState } from "react";
import LazyImage from "./LazyImage.jsx";
import Lightbox from "./Lightbox.jsx";
import styles from "./ProductGallery.module.css";

const DEFAULT_LABELS = { zoom: "Zoom photo", photo: "Photo" };

export default function ProductGallery({ images, name, labels = DEFAULT_LABELS }) {
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
            aria-label={`${labels.zoom} ${index + 1} / ${images.length}`}
          >
            <LazyImage fill src={image.url} className={styles.img} priority={index === 0} width={800} sizes="(min-width: 1024px) 50vw, 100vw" />
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
                aria-label={`${labels.photo} ${index + 1}`}
                aria-current={index === active ? "true" : undefined}
              >
                <LazyImage fill src={image.url} className={styles.thumbImg} width={240} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Lightbox items={images} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
    </div>
  );
}
