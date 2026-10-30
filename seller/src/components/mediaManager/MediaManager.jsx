import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { canAdd, classifyFile, coverIndex, limitNote } from "@epicmkt/shared";
import { ITEM_PHOTO_SPEC } from "../../lib/imageCrop.js";
import { hasTouchCamera, loadPhoto, releasePhoto } from "../../lib/photoCanvas.js";
import { errorText } from "../../lib/errors.js";
import CropDialog from "../shopPhotos/CropDialog.jsx";
import Modal from "../../pages/business/catalog/Modal.jsx";
import MediaTile from "./MediaTile.jsx";
import MediaSourceSheet from "./MediaSourceSheet.jsx";
import useTileDrag from "./useTileDrag.js";
import ui from "../../styles/ui.module.css";
import styles from "./mediaManager.module.css";

const PICK = "image/jpeg,image/png,image/webp,video/mp4,video/webm";
const typing = (el) => el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);

export default function MediaManager({ manager, hasItem, disabled = false }) {
  const { tiles, usage, problems, announcement, focus } = manager;
  const gridRef = useRef(null);
  const rootRef = useRef(null);
  const addRef = useRef(null);
  const pickRef = useRef(null);
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const [sheet, setSheet] = useState(false);
  const [over, setOver] = useState(false);
  const [job, setJob] = useState(null);
  const [preview, setPreview] = useState(null);
  const jobRef = useRef(null);
  jobRef.current = job;
  const camera = hasTouchCamera();
  const cover = coverIndex(tiles);
  const bothFull = !canAdd(usage, "image") && !canAdd(usage, "video");
  const noteIds = ["image", "video"].filter((k) => !canAdd(usage, k)).map((k) => limitNote(usage, k));
  const addDisabled = disabled || bothFull;

  const drag = useTileDrag({ gridRef, disabled, onDrop: (key, to) => manager.moveTo(key, to) });

  useEffect(() => () => releasePhoto(jobRef.current?.photo), []);

  useEffect(() => {
    if (!focus) return;
    const root = rootRef.current;
    const el = focus.key
      ? root?.querySelector(`[data-tile="${focus.key}"] [data-act="${focus.act}"]:not(:disabled)`) ?? root?.querySelector(`[data-tile="${focus.key}"] button:not(:disabled)`)
      : addRef.current;
    el?.focus();
  }, [focus]);

  useEffect(() => {
    const onPaste = (e) => {
      if (typing(e.target) || disabled) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => classifyFile(f).kind);
      if (!files.length) return;
      e.preventDefault();
      manager.addFiles(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [manager.addFiles, disabled]);

  const onPick = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    manager.addFiles(files);
  };

  const onCameraPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const known = classifyFile(file);
    if (known.code) {
      manager.setProblems([`${file.name}: ${errorText({ code: known.code })}`]);
      return;
    }
    try {
      setJob({ photo: await loadPhoto(file, ITEM_PHOTO_SPEC), name: file.name });
    } catch (err) {
      manager.setProblems([`${file.name}: ${errorText(err, "We could not open that photo. Try another one.")}`]);
    }
  };

  const onCameraVideo = (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    manager.addFiles(files);
  };

  const closeJob = () => {
    releasePhoto(jobRef.current?.photo);
    setJob(null);
  };

  const saveCrop = async (blob) => {
    const name = `${(job.name || "photo").replace(/\.[^.]+$/, "")}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
    const file = new File([blob], name, { type: blob.type });
    closeJob();
    await manager.addFiles([file]);
  };

  const openAdd = () => (camera ? setSheet(true) : pickRef.current?.click());
  const chooseLibrary = () => { pickRef.current?.click(); setSheet(false); };
  const chooseCameraPhoto = () => { photoRef.current?.click(); setSheet(false); };
  const chooseCameraVideo = () => { videoRef.current?.click(); setSheet(false); };

  const onDragOver = (e) => {
    if (disabled || ![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
    e.preventDefault();
    setOver(true);
  };
  const onDrop = (e) => {
    if (disabled || ![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
    e.preventDefault();
    setOver(false);
    manager.addFiles(e.dataTransfer.files);
  };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-over={over ? "true" : undefined}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
      onDrop={onDrop}
    >
      <p className={styles.summary} data-testid="media-summary">{manager.summary}</p>
      {manager.cover && <p className={styles.coverNote} role="status">{manager.cover}.</p>}
      {manager.loadError && <p className={ui.error} role="alert">{manager.loadError}</p>}
      {manager.loading ? (
        <p className={styles.hint} aria-busy="true">Loading photos and videos...</p>
      ) : (
        <div className={styles.gridWrap}>
          {tiles.length > 0 && (
            <ul ref={gridRef} className={styles.grid} aria-label="Photos and videos, in the order customers see them" data-dragging={drag.dragKey ? "true" : undefined}>
              {tiles.map((tile, index) => (
                <MediaTile
                  key={tile.key}
                  tile={tile}
                  index={index}
                  total={tiles.length}
                  coverIndex={cover}
                  hasItem={hasItem}
                  drag={{ key: drag.dragKey, offset: drag.offset }}
                  handleProps={drag.handleProps}
                  onMove={manager.move}
                  onRemove={manager.remove}
                  onCancel={manager.cancel}
                  onRetry={manager.retry}
                  onPreview={setPreview}
                />
              ))}
            </ul>
          )}
          {drag.indicator && <span className={styles.drop} data-testid="drop-indicator" aria-hidden="true" style={{ left: drag.indicator.left, top: drag.indicator.top, height: drag.indicator.height }} />}
        </div>
      )}
      <div className={styles.zone}>
        <p className={styles.zoneText}>
          {tiles.length === 0 ? "Drag photos and videos here, paste an image, or add them below." : "Drop more files here, or paste an image."}
        </p>
        <button type="button" ref={addRef} className={styles.add} onClick={openAdd} disabled={addDisabled} aria-describedby={noteIds.length ? "media-limit-note" : undefined}>
          <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
          <span>{manager.checking > 0 ? "Checking files..." : camera ? "Add photos or videos" : "Add files"}</span>
        </button>
      </div>
      {noteIds.length > 0 && <p id="media-limit-note" className={styles.limit}>{noteIds.join(" ")}</p>}
      <p className={styles.hint}>Photos: JPG, PNG or WebP, at least 200 pixels, up to 10 MB. Videos: MP4 or WebM, up to 60 seconds and 25 MB. A video cannot be the cover, so the first photo is.{!hasItem && " Files upload when you add the item."}</p>
      {problems.length > 0 && (
        <ul className={styles.problems} role="alert">
          {problems.map((m) => <li key={m} className={ui.error}>{m}</li>)}
        </ul>
      )}
      <p className={styles.sr} role="status" aria-live="polite" data-testid="media-live">{announcement}</p>
      <input ref={pickRef} type="file" accept={PICK} multiple className={styles.sr} tabIndex={-1} onChange={onPick} data-testid="media-input" />
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className={styles.sr} tabIndex={-1} onChange={onCameraPhoto} data-testid="camera-photo" />
      <input ref={videoRef} type="file" accept="video/*" capture="environment" className={styles.sr} tabIndex={-1} onChange={onCameraVideo} data-testid="camera-video" />
      <MediaSourceSheet open={sheet} canPhoto={canAdd(usage, "image")} canVideo={canAdd(usage, "video")} onPhoto={chooseCameraPhoto} onVideo={chooseCameraVideo} onLibrary={chooseLibrary} onClose={() => setSheet(false)} />
      {job && <CropDialog key={job.photo.url} spec={ITEM_PHOTO_SPEC} photo={job.photo} onCancel={closeJob} onSave={saveCrop} />}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title="Video preview" labelId="media-preview-title">
        {preview && <video className={styles.player} src={preview.url} poster={preview.posterUrl ?? undefined} controls playsInline preload="metadata" aria-label="Video preview" />}
      </Modal>
    </div>
  );
}
