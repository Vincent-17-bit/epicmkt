import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faPause, faPlay, faVolumeHigh, faVolumeXmark } from "@fortawesome/free-solid-svg-icons";
import { resizedUrl } from "../lib/imageUrl.js";
import { formatDuration, normalizeMedia } from "../lib/media.js";
import { canHoverPreview, safePause, safePlay, safeRewind, useExclusivePlayback } from "../lib/videoRules.js";
import LazyImage from "./LazyImage.jsx";
import Lightbox from "./Lightbox.jsx";
import styles from "./MediaGallery.module.css";

export const GALLERY_LABELS = {
  gallery: "Photos and videos",
  choose: "Choose a photo or video",
  photo: "Photo",
  video: "Video",
  zoom: "Zoom photo",
  play: "Play video",
  pause: "Pause video",
  soundOn: "Turn sound on",
  soundOff: "Turn sound off",
  previous: "Previous",
  next: "Next",
  position: "{kind} {n} of {total}",
  videoError: "This video could not be loaded.",
  slide: "slide",
  carousel: "carousel"
};

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
const STAGE_SIZES = "(min-width: 1024px) 50vw, 100vw";

// ---- The video inside the stage. Rules live in lib/videoRules.js; this only wires them to a slide. ----
function StageVideo({ item, active, labels, label, onDuration }) {
  const ref = useRef(null);
  const userStarted = useRef(false);
  const previewing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  useExclusivePlayback(ref);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const events = [["play", () => setPlaying(true)], ["pause", () => setPlaying(false)], ["ended", () => setPlaying(false)]];
    events.forEach(([name, fn]) => el.addEventListener(name, fn));
    return () => events.forEach(([name, fn]) => el.removeEventListener(name, fn));
  }, [failed]);

  // Leaving the slide always stops the video: swiping, a thumbnail, the arrow keys.
  useEffect(() => {
    if (active) return;
    const el = ref.current;
    safePause(el);
    userStarted.current = false;
    previewing.current = false;
    if (el) {
      el.muted = true;
      setMuted(true);
    }
  }, [active]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    userStarted.current = true;
    previewing.current = false;
    if (el.paused || el.ended) safePlay(el);
    else safePause(el);
  };
  const toggleSound = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = !muted;
    setMuted(!muted);
  };
  const startPreview = (event) => {
    if (!active || userStarted.current || event.pointerType === "touch" || event.pointerType === "pen") return;
    if (!canHoverPreview()) return;
    previewing.current = true;
    safePlay(ref.current);
  };
  const stopPreview = () => {
    if (!previewing.current || userStarted.current) return;
    previewing.current = false;
    safePause(ref.current);
    safeRewind(ref.current);
  };

  if (failed) {
    return (
      <div className={styles.fallback} role="status">
        <p>{labels.videoError}</p>
      </div>
    );
  }

  return (
    <div className={styles.videoFrame} onPointerEnter={startPreview} onPointerLeave={stopPreview}>
      <video
        ref={ref}
        className={styles.video}
        src={item.poster ? item.url : `${item.url}#t=0.001`}
        poster={item.poster ? resizedUrl(item.poster, 1200) : undefined}
        preload={item.poster ? "none" : "metadata"}
        muted
        playsInline
        disablePictureInPicture
        aria-label={label}
        onClick={toggle}
        onLoadedMetadata={(e) => onDuration(item.id, e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      {!playing && (
        <button type="button" className={styles.playBig} onClick={toggle} aria-label={labels.play}>
          <FontAwesomeIcon icon={faPlay} aria-hidden="true" />
        </button>
      )}
      <div className={styles.controls}>
        {playing && (
          <button type="button" className={styles.ctrl} onClick={toggle} aria-label={labels.pause}>
            <FontAwesomeIcon icon={faPause} aria-hidden="true" />
          </button>
        )}
        <button type="button" className={styles.ctrl} onClick={toggleSound} aria-pressed={!muted} aria-label={muted ? labels.soundOn : labels.soundOff}>
          <FontAwesomeIcon icon={muted ? faVolumeXmark : faVolumeHigh} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---- A thumbnail in the rail. Photos and videos look the same; a video adds a play badge and its length. ----
function Thumb({ item, selected, id, panelId, tabIndex, label, duration, onDuration, onSelect, setRef }) {
  return (
    <button
      ref={setRef}
      id={id}
      type="button"
      role="tab"
      className={`${styles.thumb} ${selected ? styles.current : ""}`}
      aria-selected={selected}
      aria-controls={panelId}
      aria-label={label}
      tabIndex={tabIndex}
      onClick={onSelect}
    >
      {item.kind === "video" && !item.poster ? (
        <video className={styles.thumbVideo} src={`${item.url}#t=0.001`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" disablePictureInPicture onLoadedMetadata={(e) => onDuration(item.id, e.currentTarget.duration)} />
      ) : (
        <LazyImage fill src={item.kind === "video" ? item.poster : item.url} className={styles.thumbImg} width={240} sizes="80px" />
      )}
      {item.kind === "video" && (
        <>
          <span className={styles.badge} aria-hidden="true" />
          {duration > 0 && <span className={styles.duration}>{formatDuration(duration)}</span>}
          {item.poster && duration === undefined && (
            // Poster thumbnails still learn the length: a metadata-only request, no playback.
            <video className={styles.probe} src={item.url} preload="metadata" muted tabIndex={-1} aria-hidden="true" onLoadedMetadata={(e) => onDuration(item.id, e.currentTarget.duration)} />
          )}
        </>
      )}
    </button>
  );
}

/**
 * One gallery for an item's photos and videos, in the seller's order.
 *   media: [{ id, kind: "image" | "video", url, poster?, caption?, duration? }]   (or pass `images` / `videos` the old way)
 * A large stage and a rail of thumbnails (vertical from 1024 px, a scroll-snap row below). The stage keeps one fixed
 * shape so nothing moves while pictures load. Carousel + tabs pattern for assistive tech; arrows, Home and End work.
 */
export default function MediaGallery({ media, images, videos, name = "", labels, className = "" }) {
  const text = { ...GALLERY_LABELS, ...labels };
  const uid = useId();
  const list = useMemo(() => normalizeMedia(media ? { media } : { images, videos }), [media, images, videos]);
  const trackRef = useRef(null);
  const railRef = useRef(null);
  const tabs = useRef([]);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(null);
  const [durations, setDurations] = useState({});
  const count = list.length;
  const index = Math.min(active, Math.max(count - 1, 0));

  const photos = useMemo(() => list.filter((entry) => entry.kind === "image"), [list]);
  const learn = useCallback((id, seconds) => {
    if (Number.isFinite(seconds) && seconds > 0) setDurations((prev) => (prev[id] === seconds ? prev : { ...prev, [id]: seconds }));
  }, []);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  // Jump straight to the chosen slide. A smooth scroll would slide past every slide in between and the highlight
  // would follow along, which looks like "going through all images".
  const goTo = (next, focusTab = false) => {
    const target = Math.min(Math.max(next, 0), count - 1);
    const track = trackRef.current;
    track?.scrollTo?.({ left: target * track.clientWidth, behavior: "instant" });
    setActive(target);
    if (focusTab) tabs.current[target]?.focus();
  };

  // Keep the chosen thumbnail visible inside the rail without scrolling the page.
  useEffect(() => {
    const rail = railRef.current;
    const tab = tabs.current[index];
    if (!rail || !tab) return;
    rail.scrollLeft = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2;
    rail.scrollTop = tab.offsetTop - (rail.clientHeight - tab.offsetHeight) / 2;
  }, [index]);

  // Fetch the neighbours' stage pictures ahead of time so stepping feels instant.
  useEffect(() => {
    if (typeof Image === "undefined") return;
    [index - 1, index + 1].forEach((n) => {
      const near = list[n];
      if (near?.kind === "image") new Image().src = resizedUrl(near.url, 1200);
    });
  }, [index, list]);

  const onKeyDown = (event) => {
    if (zoom !== null || event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)) return;
    const inRail = railRef.current?.contains(event.target);
    let next = null;
    if (event.key === "ArrowRight" || (inRail && event.key === "ArrowDown")) next = index + 1;
    else if (event.key === "ArrowLeft" || (inRail && event.key === "ArrowUp")) next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null || next < 0 || next > count - 1) {
      if (next !== null) event.preventDefault();
      return;
    }
    event.preventDefault();
    goTo(next, Boolean(inRail));
  };

  if (!count) return null;

  const kindLabel = (entry) => (entry.kind === "video" ? text.video : text.photo);
  const position = (entry, n) => fill(text.position, { kind: kindLabel(entry), n: n + 1, total: count });
  const tabId = (n) => `${uid}-tab-${n}`;
  const panelId = (n) => `${uid}-panel-${n}`;
  const current = list[index];

  return (
    <>
      <div className={`${styles.root} ${className}`} role="region" aria-roledescription={text.carousel} aria-label={name || text.gallery} onKeyDown={onKeyDown}>
        <div className={styles.stage}>
          <div ref={trackRef} className={styles.track} onScroll={onScroll}>
            {list.map((entry, n) => {
              const isActive = n === index;
              const photoIndex = photos.indexOf(entry);
              return (
                <div
                  key={entry.id}
                  id={panelId(n)}
                  className={styles.slide}
                  role={count > 1 ? "tabpanel" : "group"}
                  aria-roledescription={text.slide}
                  aria-label={count > 1 ? undefined : position(entry, n)}
                  aria-labelledby={count > 1 ? tabId(n) : undefined}
                  data-kind={entry.kind}
                  data-active={isActive ? "true" : "false"}
                  aria-hidden={isActive ? undefined : "true"}
                  inert={isActive ? undefined : ""}
                >
                  {entry.kind === "video" ? (
                    <StageVideo item={entry} active={isActive} labels={text} label={entry.caption || `${text.video} ${n + 1}`} onDuration={learn} />
                  ) : (
                    <button type="button" className={styles.zoom} onClick={() => setZoom(photoIndex)} aria-label={`${text.zoom} ${n + 1} / ${count}`}>
                      <LazyImage fill src={entry.url} className={styles.img} priority={n === 0} width={1200} sizes={STAGE_SIZES} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {count > 1 && (
            <>
              <p className={styles.counter} aria-hidden="true">
                {index + 1} / {count}
              </p>
              <button type="button" className={`${styles.arrow} ${styles.prev}`} onClick={() => goTo(index - 1)} disabled={index === 0} aria-label={text.previous}>
                <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
              </button>
              <button type="button" className={`${styles.arrow} ${styles.next}`} onClick={() => goTo(index + 1)} disabled={index === count - 1} aria-label={text.next}>
                <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
              </button>
            </>
          )}
          <p className={styles.sr} aria-live="polite" aria-atomic="true">
            {position(current, index)}
          </p>
        </div>

        {count > 1 && (
          <div ref={railRef} className={styles.rail} role="tablist" aria-label={text.choose} aria-orientation="horizontal">
            {list.map((entry, n) => (
              <Thumb
                key={entry.id}
                item={entry}
                id={tabId(n)}
                panelId={panelId(n)}
                selected={n === index}
                tabIndex={n === index ? 0 : -1}
                label={position(entry, n)}
                duration={entry.duration ?? durations[entry.id]}
                onDuration={learn}
                onSelect={() => goTo(n)}
                setRef={(node) => {
                  tabs.current[n] = node;
                }}
              />
            ))}
          </div>
        )}
      </div>
      <Lightbox items={photos} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
    </>
  );
}
