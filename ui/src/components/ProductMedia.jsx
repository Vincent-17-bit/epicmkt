import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight, faPlay, faXmark } from "@fortawesome/free-solid-svg-icons";
import { resizedUrl } from "../lib/imageUrl.js";
import { formatDuration, normalizeMedia } from "../lib/media.js";
import styles from "./ProductMedia.module.css";

// How many photo thumbnails the rail shows before the "N+" tile takes over.
const RAIL_PHOTOS = 5;
const FOCUSABLE = 'a[href], button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

export const PRODUCT_MEDIA_LABELS = {
  fullView: "Click to see full view",
  images: "Images",
  videos: "Videos",
  videosFor: "Videos for this product",
  close: "Close",
  previous: "Previous image",
  next: "Next image",
  photo: "Photo {n} of {total}",
  morePhotos: "{n} more photos",
  videoCount: "{n} videos",
  videoCountOne: "1 video",
  viewer: "{name}: photos and videos",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out"
};
const fill = (text, values) => Object.entries(values).reduce((out, [k, v]) => out.replace(`{${k}}`, String(v)), text);

/**
 * The item's pictures and videos the way big marketplaces show them: a vertical rail of thumbnails beside a large photo,
 * an "N+" tile for the rest of the photos, an "N VIDEOS" tile, and "Click to see full view", which opens a viewer with
 * VIDEOS and IMAGES tabs. On phones the photo swipes and the rail sits underneath.
 *   media: [{ id, kind: "image" | "video", url, poster?, caption?, duration?, by? }]   (or images / videos)
 *   focus: { id, n }: show that photo (a picked colour jumps to its photo); n changes on every pick.
 *   variantLabel: "Colour: Black", shown in the viewer under the item's name.
 */
export default function ProductMedia({ media, images, videos, name = "", labels, focus = null, variantLabel = "", className = "" }) {
  const text = { ...PRODUCT_MEDIA_LABELS, ...labels };
  const list = useMemo(() => normalizeMedia(media ? { media } : { images, videos }), [media, images, videos]);
  const photos = useMemo(() => list.filter((m) => m.kind === "image"), [list]);
  const clips = useMemo(() => list.filter((m) => m.kind === "video"), [list]);
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState(null); // { tab: "images" | "videos", index }
  const trackRef = useRef(null);
  const openerRef = useRef(null);
  const index = Math.min(active, Math.max(photos.length - 1, 0));

  useEffect(() => {
    if (!focus?.id) return;
    const at = photos.findIndex((p) => p.id === focus.id);
    if (at >= 0) show(at);
  }, [focus?.id, focus?.n]);

  const show = (n) => {
    const next = Math.min(Math.max(n, 0), photos.length - 1);
    setActive(next);
    const track = trackRef.current;
    if (track?.clientWidth) track.scrollTo?.({ left: next * track.clientWidth, behavior: "instant" });
  };
  const open = (tab, at, event) => {
    openerRef.current = event?.currentTarget ?? null;
    setViewer({ tab, index: at });
  };
  const onTrackScroll = () => {
    const track = trackRef.current;
    if (track?.clientWidth) setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  // No photos and no videos: no gallery at all, as before (the page closes up around it).
  if (!list.length) return null;

  const railPhotos = photos.length > RAIL_PHOTOS + 1 ? photos.slice(0, RAIL_PHOTOS) : photos;
  const rest = photos.length - railPhotos.length;

  return (
    <div className={`${styles.wrap} ${className}`}>
      <div className={styles.rail} role="list" aria-label={text.images}>
        {railPhotos.map((p, i) => (
          <div role="listitem" key={p.id}>
            <button
              type="button"
              className={styles.thumb}
              aria-current={i === index ? "true" : undefined}
              aria-label={fill(text.photo, { n: i + 1, total: photos.length })}
              onMouseEnter={() => show(i)}
              onFocus={() => show(i)}
              onClick={() => show(i)}
            >
              <img src={resizedUrl(p.url, 160)} alt="" loading="lazy" decoding="async" />
            </button>
          </div>
        ))}
        {rest > 0 && (
          <div role="listitem">
            <button type="button" className={`${styles.thumb} ${styles.moreTile}`} aria-label={fill(text.morePhotos, { n: rest })} onClick={(e) => open("images", RAIL_PHOTOS, e)}>
              <img src={resizedUrl(photos[RAIL_PHOTOS].url, 160)} alt="" loading="lazy" decoding="async" />
              <span className={styles.moreCount} aria-hidden="true">{rest}+</span>
            </button>
          </div>
        )}
        {clips.length > 0 && (
          <div role="listitem" className={styles.videoTileWrap}>
            <button type="button" className={`${styles.thumb} ${styles.videoTile}`} aria-label={clips.length === 1 ? text.videoCountOne : fill(text.videoCount, { n: clips.length })} onClick={(e) => open("videos", 0, e)}>
              {clips[0].poster ? <img src={resizedUrl(clips[0].poster, 160)} alt="" loading="lazy" decoding="async" /> : <span className={styles.videoBlank} />}
              <span className={styles.play} aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
            </button>
            <span className={styles.videoCount} aria-hidden="true">{clips.length === 1 ? text.videoCountOne : fill(text.videoCount, { n: clips.length })}</span>
          </div>
        )}
      </div>

      <div className={styles.stageCol}>
        {photos.length > 0 ? (
          <div className={styles.stage}>
            <div ref={trackRef} className={styles.track} onScroll={onTrackScroll}>
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={styles.slide}
                  tabIndex={i === index ? 0 : -1}
                  aria-hidden={i === index ? undefined : true}
                  aria-label={`${text.fullView}: ${fill(text.photo, { n: i + 1, total: photos.length })}`}
                  onClick={(e) => open("images", i, e)}
                >
                  <img src={resizedUrl(p.url, 1200)} alt={p.caption || name} loading={i === 0 ? "eager" : "lazy"} fetchpriority={i === 0 ? "high" : undefined} decoding="async" />
                </button>
              ))}
            </div>
            {photos.length > 1 && (
              <span className={styles.counter} aria-hidden="true">
                {index + 1} / {photos.length}
              </span>
            )}
          </div>
        ) : (
          <button type="button" className={styles.stage} onClick={(e) => open("videos", 0, e)} aria-label={text.videos}>
            {clips[0].poster && <img src={clips[0].poster} alt="" />}
            <span className={styles.bigPlay} aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
          </button>
        )}
        <button type="button" className={styles.fullView} onClick={(e) => open(photos.length ? "images" : "videos", photos.length ? index : 0, e)}>
          {text.fullView}
        </button>
      </div>

      {viewer && (
        <MediaViewer
          name={name}
          variantLabel={variantLabel}
          photos={photos}
          clips={clips}
          start={viewer}
          text={text}
          onClose={(at) => {
            setViewer(null);
            if (Number.isInteger(at)) show(at);
            requestAnimationFrame(() => openerRef.current?.focus?.());
          }}
        />
      )}
    </div>
  );
}

/** The full view: VIDEOS and IMAGES tabs over a dimmed page. Esc, the close button or a click outside closes it. */
export function MediaViewer({ name, variantLabel, photos, clips, start, text, onClose }) {
  const uid = useId();
  const panelRef = useRef(null);
  const [tab, setTab] = useState(start.tab === "videos" && clips.length ? "videos" : photos.length ? "images" : "videos");
  const [photo, setPhoto] = useState(start.tab === "images" ? Math.min(start.index, photos.length - 1) : 0);
  const [clip, setClip] = useState(start.tab === "videos" ? Math.min(start.index, clips.length - 1) : 0);
  const [zoom, setZoom] = useState(null);
  const close = () => onClose(tab === "images" ? photo : undefined);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector(`[aria-selected="true"]`)?.focus();
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Tab") {
        const nodes = [...(panelRef.current?.querySelectorAll(FOCUSABLE) ?? [])].filter((n) => n.getClientRects().length);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      // Arrow keys on the tabs switch tabs (onTabKey); inside a video or a field they belong to that control.
      const inField = /^(VIDEO|INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "") || document.activeElement?.getAttribute("role") === "tab";
      if (tab === "images" && !inField && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault();
        setZoom(null);
        setPhoto((p) => (p + (event.key === "ArrowRight" ? 1 : -1) + photos.length) % photos.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const tabs = [...(clips.length ? [["videos", text.videos]] : []), ...(photos.length ? [["images", text.images]] : [])];
  const onTabKey = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const at = tabs.findIndex(([id]) => id === tab);
    const next = tabs[(at + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length][0];
    setTab(next);
    requestAnimationFrame(() => document.getElementById(`${uid}-tab-${next}`)?.focus());
  };
  const current = photos[photo];
  const video = clips[clip];

  const toggleZoom = (event) => {
    if (zoom) return setZoom(null);
    const box = event.currentTarget.getBoundingClientRect();
    setZoom({ x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 });
  };

  return createPortal(
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={panelRef} className={styles.viewer} role="dialog" aria-modal="true" aria-label={fill(text.viewer, { name })}>
        <div className={styles.viewerHead}>
          <div role="tablist" aria-label={fill(text.viewer, { name })} className={styles.tabs} onKeyDown={onTabKey}>
            {tabs.map(([id, label]) => (
              <button
                key={id}
                id={`${uid}-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls={`${uid}-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                className={styles.tab}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.close} onClick={close} aria-label={text.close}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
        </div>

        {tab === "images" && current && (
          <div id={`${uid}-panel-images`} role="tabpanel" aria-labelledby={`${uid}-tab-images`} className={styles.viewerBody}>
            <div className={styles.viewerMain}>
              <button type="button" className={styles.zoomBox} data-zoomed={zoom ? "" : undefined} onClick={toggleZoom} aria-label={zoom ? text.zoomOut : text.zoomIn}>
                <img
                  key={current.id}
                  src={resizedUrl(current.url, 1600)}
                  alt={current.caption || name}
                  style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
                />
              </button>
              {photos.length > 1 && (
                <>
                  <button type="button" className={`${styles.nav} ${styles.prev}`} aria-label={text.previous} onClick={() => { setZoom(null); setPhoto((p) => (p - 1 + photos.length) % photos.length); }}>
                    <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
                  </button>
                  <button type="button" className={`${styles.nav} ${styles.next}`} aria-label={text.next} onClick={() => { setZoom(null); setPhoto((p) => (p + 1) % photos.length); }}>
                    <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                  </button>
                </>
              )}
              <p className={styles.caption} aria-live="polite">
                {fill(text.photo, { n: photo + 1, total: photos.length })}
                {current.caption ? ` · ${current.caption}` : ""}
              </p>
            </div>
            <aside className={styles.viewerSide}>
              <h2 className={styles.viewerName}>{name}</h2>
              {variantLabel && <p className={styles.variant}>{variantLabel}</p>}
              <div className={styles.grid}>
                {photos.map((p, i) => (
                  <button key={p.id} type="button" className={styles.gridThumb} aria-current={i === photo ? "true" : undefined} aria-label={fill(text.photo, { n: i + 1, total: photos.length })} onClick={() => { setZoom(null); setPhoto(i); }}>
                    <img src={resizedUrl(p.url, 200)} alt="" loading="lazy" decoding="async" />
                  </button>
                ))}
              </div>
            </aside>
          </div>
        )}

        {tab === "videos" && video && (
          <div id={`${uid}-panel-videos`} role="tabpanel" aria-labelledby={`${uid}-tab-videos`} className={styles.viewerBody}>
            <div className={styles.viewerMain}>
              <div className={styles.player}>
                <video key={video.id} src={video.url} poster={video.poster} controls autoPlay playsInline preload="auto" className={styles.video} />
              </div>
              <div className={styles.videoMeta}>
                <h2 className={styles.videoTitle}>{video.caption || name}</h2>
                {video.by && <p className={styles.videoBy}>{video.by}</p>}
              </div>
            </div>
            <aside className={styles.viewerSide}>
              <h2 className={styles.listTitle}>{text.videosFor}</h2>
              <ul className={styles.videoList}>
                {clips.map((c, i) => (
                  <li key={c.id}>
                    <button type="button" className={styles.videoItem} aria-current={i === clip ? "true" : undefined} onClick={() => setClip(i)}>
                      <span className={styles.videoThumb}>
                        {c.poster ? <img src={resizedUrl(c.poster, 240)} alt="" loading="lazy" decoding="async" /> : <span className={styles.videoBlank} />}
                        <span className={styles.play} aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
                        {c.duration && <span className={styles.duration}>{formatDuration(c.duration)}</span>}
                      </span>
                      <span className={styles.videoText}>
                        <span className={styles.videoItemTitle}>{c.caption || name}</span>
                        {c.by && <span className={styles.videoItemBy}>{c.by}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
