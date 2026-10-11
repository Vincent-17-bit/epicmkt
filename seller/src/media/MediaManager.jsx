import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp, faCamera, faVideo, faFolderOpen, faEye } from "@fortawesome/free-solid-svg-icons";
import { atMediaLimit, coverOf, canPublish, PUBLISH_BLOCKED_MESSAGE, MEDIA_UI_RULES } from "@epicmkt/shared";
import { useItemMedia } from "./useItemMedia.js";
import * as store from "./mediaStore.js";
import { MediaCard, UploadCard } from "./MediaCards.jsx";
import { PosterDialog } from "./PosterDialog.jsx";
import { PreviewDialog } from "./PreviewDialog.jsx";
import styles from "./media.module.css";

const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");

// Lets any element take dropped files. `over` is true only while files (not text or links) are dragged on top.
export function useFileDrop(onFiles, disabled = false) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const reset = () => { depth.current = 0; setOver(false); };
  const props = {
    onDragEnter: (e) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); depth.current += 1; setOver(true); },
    onDragOver: (e) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: (e) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
    onDrop: (e) => { if (disabled || !hasFiles(e)) return; e.preventDefault(); const files = [...e.dataTransfer.files]; reset(); if (files.length) onFiles(files); },
  };
  return { over, props };
}

const coarse = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.webm,.mov";

export function MediaManager({ itemId, itemName = "", itemSaved = true, limits, planKey = "standard", variants = [], compact = false }) {
  const m = useItemMedia(itemId, { limits, itemSaved });
  const { slice, media, jobs, counts } = m;
  const browseRef = useRef(null);
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceTarget = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [posterFor, setPosterFor] = useState(null);
  const [phone, setPhone] = useState(false);
  useEffect(() => { setPhone(coarse()); }, []);

  const add = useCallback((files) => store.addFiles(itemId, files), [itemId]);
  const drop = useFileDrop(add);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = media.map((x) => x.id);
  const cover = coverOf(media);
  const eff = m.limits;
  const photosFull = eff ? atMediaLimit(counts, eff, "image") : false;
  const videosFull = eff ? atMediaLimit(counts, eff, "video") : false;
  const allFull = photosFull && videosFull;
  const premium = planKey === "premium";

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from >= 0 && to >= 0) store.moveMedia(itemId, active.id, to);
  };

  const replacing = useMemo(() => new Map(jobs.filter((j) => j.replacing).map((j) => [j.replacing, j])), [jobs]);
  const shownJobs = jobs.filter((j) => !(j.replacing && !j.error));
  const pick = (ref) => (e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) add(files); };

  return (
    <section className={styles.section} aria-label="Photos and videos" data-media-section={itemId}>
      <div className={styles.head}>
        <h3>Photos and videos</h3>
        <span className={`${styles.counter} ${allFull ? styles.counterFull : ""}`} data-testid="media-counter" aria-live="polite">{m.counterText}</span>
      </div>
      <p className={styles.muted}>
        The first photo is the cover shoppers see on item cards. Photos need to be at least {MEDIA_UI_RULES.image.minLongSide}px on the long side. Videos up to {MEDIA_UI_RULES.video.maxSeconds} seconds and {Math.round(MEDIA_UI_RULES.video.maxBytes / 1048576)} MB, MP4 or WebM.
      </p>

      {(slice.limitHit || photosFull || videosFull) && eff && (
        <div className={styles.upgrade} role={slice.limitHit ? "alert" : "note"} data-testid="media-limit">
          <div>
            <strong>
              {slice.limitHit === "video" || (!slice.limitHit && videosFull && !photosFull) ? `You have used all ${eff.videos} ${eff.videos === 1 ? "video" : "videos"} on your plan.` : `You have used all ${eff.photos} photos on your plan.`}
            </strong>
            <p>{premium ? "Delete one to make room, or contact support to raise your limit." : "Upgrade to Premium for more photos and videos, or delete one you no longer need."}</p>
          </div>
          {!premium && <Link className={styles.upgradeLink} to="/business/plan">See Premium</Link>}
          {slice.limitHit && <button type="button" className={styles.textBtn} onClick={() => store.dismissLimit(itemId)}>Dismiss</button>}
        </div>
      )}

      <div className={styles.drop} data-over={drop.over ? "true" : "false"} data-disabled={allFull ? "true" : undefined} data-testid="media-dropzone" {...drop.props}>
        <FontAwesomeIcon icon={faCloudArrowUp} className={styles.dropIcon} aria-hidden="true" />
        <p className={styles.dropTitle}>{drop.over ? "Drop to add" : "Drag photos or videos here"}</p>
        <div className={styles.dropBtns}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => browseRef.current?.click()}><FontAwesomeIcon icon={faFolderOpen} /> Browse</button>
          {phone && (
            <>
              <button type="button" className={styles.btn} onClick={() => photoRef.current?.click()}><FontAwesomeIcon icon={faCamera} /> Take photo</button>
              <button type="button" className={styles.btn} onClick={() => videoRef.current?.click()}><FontAwesomeIcon icon={faVideo} /> Record video</button>
            </>
          )}
        </div>
        <input ref={browseRef} type="file" multiple accept={ACCEPT} className={styles.hidden} tabIndex={-1} aria-label="Choose photos or videos" data-testid="media-browse" onChange={pick(browseRef)} />
        {phone && <input ref={photoRef} type="file" accept="image/*" capture="environment" className={styles.hidden} tabIndex={-1} aria-label="Take a photo" data-testid="media-capture-photo" onChange={pick(photoRef)} />}
        {phone && <input ref={videoRef} type="file" accept="video/*" capture="environment" className={styles.hidden} tabIndex={-1} aria-label="Record a video" data-testid="media-capture-video" onChange={pick(videoRef)} />}
        <input ref={replaceRef} type="file" accept={ACCEPT} className={styles.hidden} tabIndex={-1} aria-label="Choose a replacement file" data-testid="media-replace-input"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; const target = replaceTarget.current; replaceTarget.current = null; if (f && target) store.addFiles(itemId, [f], { replacing: target }); }} />
      </div>

      {!itemSaved && <p className={styles.note} role="note">Files are prepared now and uploaded as soon as this item is saved.</p>}
      {!canPublish(media) && media.length + jobs.length > 0 && <p className={styles.warning}>{PUBLISH_BLOCKED_MESSAGE}</p>}
      {m.loading && <p className={styles.muted} role="status">Loading your photos…</p>}
      {m.error && <p className={styles.problem} role="alert">Could not load photos. <button type="button" className={styles.linkBtn} onClick={() => store.load(itemId, { force: true })}>Try again</button></p>}

      {(media.length > 0 || shownJobs.length > 0) && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
          accessibility={{ announcements: {
            onDragStart: ({ active }) => `Picked up media ${ids.indexOf(active.id) + 1} of ${ids.length}.`,
            onDragOver: ({ over }) => (over ? `Over position ${ids.indexOf(over.id) + 1}.` : ""),
            onDragEnd: ({ over }) => (over ? `Dropped at position ${ids.indexOf(over.id) + 1} of ${ids.length}.` : "Dropped."),
            onDragCancel: () => "Reorder cancelled.",
          } }}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <ul className={styles.grid} aria-label="Media in shopper order" data-testid="media-grid">
              {media.map((x, i) => (
                <MediaCard key={x.id} media={x} position={i + 1} total={media.length} isCover={cover?.id === x.id} itemName={itemName} variants={variants}
                  replacingJob={replacing.get(x.id)}
                  onMove={(to) => store.moveMedia(itemId, x.id, to)}
                  onSetCover={() => store.setCover(itemId, x.id)}
                  onReplace={() => { replaceTarget.current = x.id; replaceRef.current?.click(); }}
                  onRemove={() => store.removeMedia(itemId, x.id)}
                  onUpdate={(patch) => store.updateMedia(itemId, x.id, patch)}
                  onPoster={() => setPosterFor(x)} />
              ))}
              {shownJobs.map((j) => (
                <UploadCard key={j.id} job={j} onCancel={() => store.cancelJob(itemId, j.id)} onRetry={() => store.retryJob(itemId, j.id)} onDismiss={() => store.dismissJob(itemId, j.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className={styles.dropBtns} style={{ justifyContent: "flex-start" }}>
        <button type="button" className={styles.btn} onClick={() => setPreviewOpen(true)} disabled={!media.length}><FontAwesomeIcon icon={faEye} /> Preview gallery</button>
      </div>
      <div className={styles.live} role="status" aria-live="polite">{slice.notice}</div>

      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} media={media} itemName={itemName} />
      <PosterDialog itemId={itemId} media={posterFor ? media.find((x) => x.id === posterFor.id) ?? null : null} onClose={() => setPosterFor(null)} />
    </section>
  );
}
