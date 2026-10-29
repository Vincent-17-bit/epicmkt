import { useEffect, useRef, useState } from "react";
import { faArrowLeft, faArrowRight, faImage, faTrashCan, faVideo } from "@fortawesome/free-solid-svg-icons";
import { inspectMedia } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { mediaUrl } from "../../../../api/shape.js";
import { errorText } from "../../../../lib/errors.js";
import { moved } from "./model.js";
import { EmptyState, IconBtn } from "./parts.jsx";
import styles from "./editor.module.css";

/* ===================================================================================================================
 * MEDIA SLOT  (step 4 replaces this file)
 *
 * The editor only knows this contract, so the new media manager can swap in without touching the rest of the page:
 *
 *   const media = useMediaSlot(item, { onPhotosChanged });   // state, owned by the editor so the preview can read it
 *   media.imageUrls     string[]   every picture in order, saved or queued (the live preview shows the first as the cover)
 *   media.photoCount    number     how many pictures there are (drives the quality meter)
 *   media.hasQueued     boolean    files chosen on a new item that still have to upload (counts as unsaved changes)
 *   media.busy          boolean    an upload or reorder is running
 *   media.flush(itemId) Promise    uploads what is queued after the item row exists; resolves { problems: string[] }
 *
 *   <MediaSlot media={media} disabled={saving} />            // the controls: add, order, remove, for photos and videos
 *
 * Until step 4, this is the old Photos and Videos code, moved over unchanged in behaviour.
 * ================================================================================================================ */

const PHOTO_TYPES = "image/jpeg,image/png,image/webp";
const VIDEO_TYPES = "video/mp4,video/webm";
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;

// A quick check so a wrong file is refused before a long upload. The server reads the real bytes and has the final say.
const videoProblem = (file) => {
  if (!["video/mp4", "video/webm"].includes(file.type)) return errorText({ code: "video_unsupported" });
  if (file.size > VIDEO_MAX_BYTES) return errorText({ code: "video_too_large" });
  return null;
};

const photoProblem = async (file) => {
  const info = inspectMedia(new Uint8Array(await file.arrayBuffer()));
  if (!info.ok) return errorText({ code: info.reason });
  return info.kind === "image" ? null : errorText({ code: "unsupported_type" });
};

export function useMediaSlot(item, { onPhotosChanged } = {}) {
  const [saved, setSaved] = useState(() => item?.imagePaths ?? []);
  const [queued, setQueued] = useState([]);
  const [videos, setVideos] = useState([]);
  const [queuedVideos, setQueuedVideos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [photoErrors, setPhotoErrors] = useState([]);
  const [videoErrors, setVideoErrors] = useState([]);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  const queuedVideosRef = useRef(queuedVideos);
  queuedVideosRef.current = queuedVideos;
  useEffect(() => () => {
    queuedRef.current.forEach((q) => URL.revokeObjectURL(q.url));
    queuedVideosRef.current.forEach((q) => URL.revokeObjectURL(q.url));
  }, []);

  // The item's saved videos are read when the editor opens (the catalog list only carries photo paths).
  useEffect(() => {
    if (!item?.id) return undefined;
    let live = true;
    api.listItemVideos(item.id).then((paths) => live && setVideos(paths)).catch(() => {});
    return () => { live = false; };
  }, [item?.id]);

  const addPhotos = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setPhotoBusy(true);
    setPhotoErrors([]);
    const problems = [];
    for (const file of files) {
      const bad = await photoProblem(file);
      if (bad) {
        problems.push(`${file.name}: ${bad}`);
        continue;
      }
      if (!item) {
        setQueued((q) => [...q, { file, url: URL.createObjectURL(file) }]);
        continue;
      }
      try {
        const { path } = await api.uploadItemPhoto(item.id, file);
        setSaved((list) => [...list, path]);
      } catch (err) {
        problems.push(`${file.name}: ${errorText(err)}`);
        if (err?.code === "photo_limit") break;
      }
    }
    setPhotoErrors(problems);
    setPhotoBusy(false);
    if (item) onPhotosChanged?.();
  };

  const removeSaved = async (path) => {
    setPhotoBusy(true);
    setPhotoErrors([]);
    try {
      await api.removeItemPhoto(path);
      setSaved((list) => list.filter((p) => p !== path));
      onPhotosChanged?.();
    } catch (err) {
      setPhotoErrors([errorText(err)]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeQueued = (url) => {
    URL.revokeObjectURL(url);
    setQueued((list) => list.filter((q) => q.url !== url));
  };

  const moveSaved = async (from, to) => {
    const before = saved;
    const next = moved(saved, from, to);
    setPhotoBusy(true);
    setPhotoErrors([]);
    setSaved(next);
    try {
      await api.reorderItemPhotos(item.id, next);
      onPhotosChanged?.();
    } catch (err) {
      setSaved(before);
      setPhotoErrors([errorText(err)]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const addVideos = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setVideoBusy(true);
    setVideoErrors([]);
    const problems = [];
    for (const file of files) {
      const bad = videoProblem(file);
      if (bad) {
        problems.push(`${file.name}: ${bad}`);
        continue;
      }
      if (!item) {
        setQueuedVideos((q) => [...q, { file, url: URL.createObjectURL(file) }]);
        continue;
      }
      try {
        const { path } = await api.uploadItemVideo(item.id, file);
        setVideos((list) => [...list, path]);
      } catch (err) {
        problems.push(`${file.name}: ${errorText(err)}`);
        if (err?.code === "video_limit") break;
      }
    }
    setVideoErrors(problems);
    setVideoBusy(false);
    if (item) onPhotosChanged?.();
  };

  const removeSavedVideo = async (path) => {
    setVideoBusy(true);
    setVideoErrors([]);
    try {
      await api.removeItemVideo(path);
      setVideos((list) => list.filter((p) => p !== path));
      onPhotosChanged?.();
    } catch (err) {
      setVideoErrors([errorText(err)]);
    } finally {
      setVideoBusy(false);
    }
  };

  const removeQueuedVideo = (url) => {
    URL.revokeObjectURL(url);
    setQueuedVideos((list) => list.filter((q) => q.url !== url));
  };

  const tiles = [
    ...saved.map((path, n) => ({ key: path, src: mediaUrl(path), remove: () => removeSaved(path), move: (to) => moveSaved(n, to), at: n, count: saved.length })),
    ...queued.map((q, n) => ({ key: q.url, src: q.url, remove: () => removeQueued(q.url), move: (to) => setQueued((list) => moved(list, n, to)), at: n, count: queued.length })),
  ];
  const videoTiles = [
    ...videos.map((path) => ({ key: path, src: mediaUrl(path), remove: () => removeSavedVideo(path) })),
    ...queuedVideos.map((q) => ({ key: q.url, src: q.url, remove: () => removeQueuedVideo(q.url) })),
  ];

  // Uploads what a new item queued, now that the item exists. One failed file never stops the rest, except a plan limit.
  const flush = async (itemId) => {
    const problems = [];
    let photosDone = 0;
    for (const { file } of queuedRef.current) {
      try {
        await api.uploadItemPhoto(itemId, file);
        photosDone += 1;
      } catch (err) {
        problems.push(errorText(err));
        if (err?.code === "photo_limit") break;
      }
    }
    const failedPhotos = queuedRef.current.length - photosDone;
    const out = [];
    if (failedPhotos) out.push(`${photosDone} of ${queuedRef.current.length} photos uploaded. ${problems[0]}`);
    const videoProblems = [];
    let videosDone = 0;
    for (const { file } of queuedVideosRef.current) {
      try {
        await api.uploadItemVideo(itemId, file);
        videosDone += 1;
      } catch (err) {
        videoProblems.push(errorText(err));
        if (err?.code === "video_limit") break;
      }
    }
    if (queuedVideosRef.current.length - videosDone) out.push(`${videosDone} of ${queuedVideosRef.current.length} videos uploaded. ${videoProblems[0]}`);
    return { problems: out };
  };

  return {
    item, tiles, videoTiles,
    imageUrls: tiles.map((t) => t.src).filter(Boolean),
    photoCount: tiles.length,
    videoCount: videoTiles.length,
    hasQueued: queued.length > 0 || queuedVideos.length > 0,
    busy: photoBusy || videoBusy,
    photoBusy, videoBusy, photoErrors, videoErrors, addPhotos, addVideos, flush,
  };
}

export default function MediaSlot({ media, disabled = false }) {
  const { item, tiles, videoTiles, photoBusy, videoBusy, photoErrors, videoErrors } = media;
  const root = useRef(null);
  const [focusKey, setFocusKey] = useState(null);
  useEffect(() => {
    if (!focusKey) return;
    const el = root.current?.querySelector(`[data-focus="${focusKey}"]`);
    if (el && !el.disabled) el.focus();
    setFocusKey(null);
  }, [focusKey, tiles]);

  const movePhoto = (t, i, dir) => () => {
    const to = t.at + dir;
    setFocusKey(`photo-${i + dir}-${dir < 0 ? (to === 0 ? "later" : "earlier") : (to === t.count - 1 ? "earlier" : "later")}`);
    t.move(to);
  };

  return (
    <div ref={root} className={styles.mediaSlot} data-slot="media">
      <div className={styles.subBlock}>
        <h3 className={styles.subTitle}>Photos {tiles.length > 0 && <span className={styles.count}>{tiles.length}</span>}</h3>
        {tiles.length === 0 ? (
          <EmptyState icon={faImage} title="No photos yet">Customers decide fast from the first picture. Add a clear one in good light.</EmptyState>
        ) : (
          <ul className={styles.photoGrid}>
            {tiles.map((t, i) => (
              <li key={t.key} className={styles.photoTile}>
                {t.src ? <img src={t.src} alt="" /> : <span className={styles.photoBlank} aria-hidden="true" />}
                {i === 0 && <span className={styles.coverBadge}>Cover</span>}
                <span className={styles.tileActions}>
                  <IconBtn icon={faArrowLeft} label={`Move photo ${i + 1} earlier`} data-focus={`photo-${i}-earlier`} onClick={movePhoto(t, i, -1)} disabled={photoBusy || disabled || t.at === 0} />
                  <IconBtn icon={faArrowRight} label={`Move photo ${i + 1} later`} data-focus={`photo-${i}-later`} onClick={movePhoto(t, i, 1)} disabled={photoBusy || disabled || t.at === t.count - 1} />
                  <IconBtn icon={faTrashCan} label={`Remove photo ${i + 1}`} tone="danger" onClick={t.remove} disabled={photoBusy || disabled} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <label className={styles.fileBtn}>
          <input type="file" accept={PHOTO_TYPES} multiple className={styles.sr} data-focus="media-add" onChange={media.addPhotos} disabled={photoBusy || disabled} />
          <span>{photoBusy ? "Working..." : "Add photos"}</span>
        </label>
        <p className={styles.hint}>JPG, PNG or WebP, at least 200 pixels, up to 10 MB each. The first photo is the cover.{!item && " Photos upload when you add the item."}</p>
        {photoErrors.map((m) => <p key={m} className={styles.error} role="alert">{m}</p>)}
      </div>

      <div className={styles.subBlock}>
        <h3 className={styles.subTitle}>Videos {videoTiles.length > 0 && <span className={styles.count}>{videoTiles.length}</span>}</h3>
        {videoTiles.length === 0 ? (
          <EmptyState icon={faVideo} title="No videos yet">A short clip shows how it looks or works. Optional.</EmptyState>
        ) : (
          <ul className={styles.videoGrid}>
            {videoTiles.map((t, i) => (
              <li key={t.key} className={styles.videoTile}>
                <video className={styles.videoPreview} src={t.src} controls preload="metadata" playsInline aria-label={`Video ${i + 1} for this item`} />
                <IconBtn icon={faTrashCan} label={`Remove video ${i + 1}`} tone="danger" onClick={t.remove} disabled={videoBusy || disabled} />
              </li>
            ))}
          </ul>
        )}
        <label className={styles.fileBtn}>
          <input type="file" accept={VIDEO_TYPES} multiple className={styles.sr} onChange={media.addVideos} disabled={videoBusy || disabled} />
          <span>{videoBusy ? "Uploading..." : "Add videos"}</span>
        </label>
        <p className={styles.hint}>MP4 or WebM, up to 60 seconds and 25 MB each. Customers watch them under this item's photos. How many you can add depends on your plan.{!item && " Videos upload when you add the item."}</p>
        {videoErrors.map((m) => <p key={m} className={styles.error} role="alert">{m}</p>)}
      </div>
    </div>
  );
}
