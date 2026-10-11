import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay } from "@fortawesome/free-solid-svg-icons";
import Lightbox from "./Lightbox.jsx";
import styles from "./ProductGallery.module.css";

const DEFAULT_LABELS = { zoom: "Zoom photo", photo: "Photo", video: "Video", playerOf: "Video" };

const clock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// images: [{ id, url, ... }] for photos, and optionally { id, kind: "video", url, poster, durationSec } for videos.
// A photo may carry srcSet/sizes/alt/zoomUrl. Videos never autoplay: they show their poster with the browser's own
// controls, and only play when the shopper presses play. Photos without a `kind` behave exactly as before.
export default function ProductGallery({ images, name, labels = DEFAULT_LABELS }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);
  const text = { ...DEFAULT_LABELS, ...labels };

  const photos = images.filter((image) => image.kind !== "video");
  const zoomItems = photos.map((image) => ({ ...image, url: image.zoomUrl ?? image.url, caption: image.caption ?? image.alt ?? name }));

  // Moving to another slide stops a video that was playing.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.querySelectorAll("video").forEach((video, i) => {
      const slide = video.closest("[data-slide]");
      if (slide && Number(slide.dataset.slide) !== active && typeof video.pause === "function") video.pause();
    });
  }, [active]);

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

  const labelFor = (image, index) => (image.kind === "video" ? `${text.video} ${index + 1}` : `${text.photo} ${index + 1}`);

  return (
    <div className={styles.gallery}>
      <div ref={trackRef} className={styles.track} onScroll={onScroll} role="group" aria-label={name}>
        {images.map((image, index) =>
          image.kind === "video" ? (
            <div key={image.id} className={`${styles.slide} ${styles.videoSlide}`} data-slide={index} data-media-id={image.id} data-kind="video">
              <video
                className={styles.video}
                src={image.url}
                poster={image.poster ?? undefined}
                controls
                preload="none"
                playsInline
                aria-label={image.alt || `${text.playerOf} ${index + 1} / ${images.length}`}
              />
            </div>
          ) : (
            <button
              key={image.id}
              type="button"
              className={styles.slide}
              data-slide={index}
              data-media-id={image.id}
              onClick={() => setZoom(photos.indexOf(image))}
              aria-label={`${text.zoom} ${index + 1} / ${images.length}`}
            >
              <img
                src={image.url}
                srcSet={image.srcSet}
                sizes={image.srcSet ? image.sizes : undefined}
                alt=""
                className={styles.img}
                decoding="async"
                loading={index === 0 ? "eager" : "lazy"}
                draggable="false"
              />
            </button>
          )
        )}
      </div>
      {images.length > 1 && (
        <ul className={styles.thumbs}>
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                className={`${styles.thumb} ${index === active ? styles.current : ""}`}
                onClick={() => goTo(index)}
                aria-label={labelFor(image, index)}
                aria-current={index === active ? "true" : undefined}
                data-kind={image.kind === "video" ? "video" : undefined}
              >
                {image.kind === "video" ? (
                  <>
                    {image.poster && <img src={image.poster} alt="" className={styles.thumbImg} loading="lazy" decoding="async" draggable="false" />}
                    <span className={styles.play} aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
                    {image.durationSec != null && <span className={styles.duration}>{clock(image.durationSec)}</span>}
                  </>
                ) : (
                  <img src={image.thumbUrl ?? image.url} alt="" className={styles.thumbImg} loading="lazy" decoding="async" draggable="false" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Lightbox items={zoomItems} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
    </div>
  );
}
