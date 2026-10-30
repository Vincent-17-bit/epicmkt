import { useRef, useState } from "react";
import LazyImage from "./LazyImage.jsx";
import Lightbox from "./Lightbox.jsx";
import styles from "./ProductGallery.module.css";
import extra from "./MediaGallery.module.css";

const DEFAULT_LABELS = { zoom: "Zoom photo", photo: "Photo", video: "Video" };

const clock = (sec) => {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export default function MediaGallery({ media, name, labels = DEFAULT_LABELS, renderVideo }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);
  const words = { ...DEFAULT_LABELS, ...labels };

  const images = media.filter((m) => m.kind !== "video");
  const ordinal = media.map((m, i) => media.slice(0, i + 1).filter((o) => (o.kind === "video") === (m.kind === "video")).length);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  const goTo = (index) => {
    const track = trackRef.current;
    track?.scrollTo({ left: index * track.clientWidth, behavior: "instant" });
    setActive(index);
  };

  if (!media.length) return null;

  return (
    <div className={styles.gallery}>
      <div ref={trackRef} className={styles.track} onScroll={onScroll} role="group" aria-label={name}>
        {media.map((item, index) => {
          if (item.kind === "video") {
            return (
              <div key={item.id} className={`${styles.slide} ${extra.videoSlide}`}>
                {renderVideo ? (
                  renderVideo(item, index)
                ) : (
                  <a className={extra.fallback} href={item.url} target="_blank" rel="noreferrer">{words.video} {ordinal[index]}</a>
                )}
              </div>
            );
          }
          const at = images.indexOf(item);
          return (
            <button
              key={item.id}
              type="button"
              className={styles.slide}
              onClick={() => setZoom(at)}
              aria-label={`${words.zoom} ${at + 1} / ${images.length}`}
            >
              <LazyImage fill src={item.url} className={styles.img} priority={index === 0} width={800} sizes="(min-width: 1024px) 50vw, 100vw" />
            </button>
          );
        })}
      </div>
      {media.length > 1 && (
        <ul className={styles.thumbs}>
          {media.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`${styles.thumb} ${index === active ? styles.current : ""}`}
                onClick={() => goTo(index)}
                aria-label={`${item.kind === "video" ? words.video : words.photo} ${ordinal[index]}`}
                aria-current={index === active ? "true" : undefined}
              >
                {item.kind === "video" ? (
                  <span className={extra.videoThumb} aria-hidden="true">
                    <span className={extra.play} />
                    {item.durationSec > 0 && <span className={extra.duration}>{clock(item.durationSec)}</span>}
                  </span>
                ) : (
                  <LazyImage fill src={item.url} className={styles.thumbImg} width={240} />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Lightbox items={images} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
    </div>
  );
}
