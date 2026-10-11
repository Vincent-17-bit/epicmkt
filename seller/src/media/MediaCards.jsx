import { useEffect, useId, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faChevronLeft, faChevronRight, faStar, faTrash, faArrowsRotate, faPlay, faTriangleExclamation, faXmark, faRotateRight, faFilm, faImage, faSliders, faClock, faBan } from "@fortawesome/free-solid-svg-icons";
import { MEDIA_UI_RULES, altProblem, formatDuration, humanSize, suggestAlt } from "@epicmkt/shared";
import styles from "./media.module.css";

const STATUS_TEXT = {
  processing: "Processing. Shoppers cannot see this yet.",
  failed: "Failed. Shoppers cannot see this.",
};
const FAIL_REASON = {
  unsupported_codec: "Most browsers cannot play this video format (HEVC). Replace it with an MP4 (H.264) file.",
};

const phaseText = (job) => {
  if (job.status === "held") return "Waiting for the item to be saved";
  if (job.status === "queued") return "Waiting";
  if (job.status === "processing") return "Preparing";
  if (job.status === "finishing") return "Finishing";
  if (job.status === "uploading") return `Uploading ${Math.round(Math.max(0, (job.progress - 0.3) / 0.6) * 100)}%`;
  if (job.status === "done") return "Added";
  return "";
};

export function UploadCard({ job, onCancel, onRetry, onDismiss }) {
  const active = ["queued", "processing", "uploading", "finishing", "held"].includes(job.status);
  const pct = Math.round((job.progress ?? 0) * 100);
  return (
    <li className={`${styles.card} ${styles.uploadCard}`} data-job={job.id} data-status={job.status} aria-label={`${job.name}: ${job.error ? "failed" : phaseText(job)}`}>
      <div className={styles.thumb}>
        {job.previewUrl ? <img src={job.previewUrl} alt="" className={styles.thumbImg} /> : <span className={styles.thumbIcon}><FontAwesomeIcon icon={job.kind === "video" ? faFilm : faImage} /></span>}
        {active && <span className={styles.spinner} aria-hidden="true" />}
      </div>
      <div className={styles.cardBody}>
        <p className={styles.fileName} title={job.name}>{job.name}</p>
        {job.error ? (
          <p className={styles.problem} role="alert"><FontAwesomeIcon icon={faTriangleExclamation} /> {job.error.message}</p>
        ) : (
          <>
            <p className={styles.muted} aria-live="polite">{phaseText(job)}</p>
            {job.status !== "done" && (
              <div className={styles.progress} role="progressbar" aria-label={`Progress for ${job.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <span style={{ width: `${pct}%` }} />
              </div>
            )}
            {job.summary ? <p className={styles.muted}>{job.summary}</p> : job.size ? <p className={styles.muted}>{humanSize(job.size)}</p> : null}
          </>
        )}
        {job.warning && !job.error && <p className={styles.warning}>{job.warning}</p>}
        <div className={styles.actions}>
          {active && <button type="button" className={styles.textBtn} onClick={onCancel}>Cancel</button>}
          {job.error && job.retryable && <button type="button" className={styles.textBtn} onClick={onRetry}><FontAwesomeIcon icon={faRotateRight} /> Retry</button>}
          {job.error && <button type="button" className={styles.textBtn} onClick={onDismiss}>Dismiss</button>}
        </div>
      </div>
    </li>
  );
}

// Saves what is typed after a pause or when the field loses focus, and tells the screen reader nothing extra.
function AltField({ media, itemName, position, onSave }) {
  const id = useId();
  const [value, setValue] = useState(media.alt);
  const last = useRef(media.alt);
  const timer = useRef(null);
  useEffect(() => { setValue(media.alt); last.current = media.alt; }, [media.alt]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const problem = altProblem(value);
  const commit = (v) => {
    clearTimeout(timer.current);
    const clean = v.trim();
    if (clean === last.current || altProblem(v)) return;
    last.current = clean;
    onSave({ alt: clean });
  };
  const suggestion = suggestAlt(itemName, position);
  return (
    <div className={styles.field}>
      <label htmlFor={id}>Alt text</label>
      <input
        id={id}
        className={styles.input}
        type="text"
        value={value}
        placeholder={suggestion}
        aria-invalid={problem ? true : undefined}
        aria-describedby={`${id}-hint`}
        onChange={(e) => { setValue(e.target.value); clearTimeout(timer.current); const v = e.target.value; timer.current = setTimeout(() => commit(v), 700); }}
        onBlur={(e) => commit(e.target.value)}
      />
      <div className={styles.fieldMeta} id={`${id}-hint`}>
        <span>
          {problem ? <span className={styles.problem}>{problem}</span> : <span className={styles.muted}>Describes the picture for people who cannot see it.</span>}
          {" "}
          {value.trim() !== suggestion && <button type="button" className={styles.linkBtn} onClick={() => { setValue(suggestion); commit(suggestion); }}>Use “{suggestion}”</button>}
        </span>
        <span className={`${styles.muted} ${value.length > MEDIA_UI_RULES.altMax ? styles.problem : ""}`} aria-hidden="true">{value.length}/{MEDIA_UI_RULES.altMax}</span>
      </div>
    </div>
  );
}

export function MediaCard({ media, position, total, isCover, itemName, variants, replacingJob, onMove, onSetCover, onReplace, onRemove, onUpdate, onPoster, onRetryFailed }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: media.id });
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const style = { transform: CSS.Transform.toString(transform), transition };
  const video = media.kind === "video";
  const kindName = video ? "video" : "photo";
  const removed = media.removedByAdmin;
  const unavailable = media.status !== "ready" || removed;
  const label = `${video ? "Video" : "Photo"} ${position}`;
  const thumb = video ? media.posterUrl : media.thumbUrl;

  return (
    <li ref={setNodeRef} style={style} className={`${styles.card} ${isDragging ? styles.dragging : ""} ${unavailable ? styles.unavailable : ""}`} data-media={media.id} data-kind={media.kind} data-status={removed ? "removed" : media.status} data-cover={isCover ? "true" : undefined}>
      <div className={styles.thumb} style={media.placeholder && !video ? { backgroundImage: `url(${media.placeholder})` } : undefined}>
        {thumb ? <img src={thumb} alt={media.alt || suggestAltFor(itemName, position)} className={styles.thumbImg} loading="lazy" draggable="false" /> : <span className={styles.thumbIcon}><FontAwesomeIcon icon={video ? faFilm : faImage} /></span>}
        {video && <span className={styles.playBadge} aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>}
        {video && media.durationSec != null && <span className={styles.duration}>{formatDuration(media.durationSec)}</span>}
        <div className={styles.badges}>
          {isCover && !unavailable && <span className={`${styles.badge} ${styles.badgeCover}`}><FontAwesomeIcon icon={faStar} /> Cover</span>}
          {removed && <span className={`${styles.badge} ${styles.badgeBad}`}><FontAwesomeIcon icon={faBan} /> Removed by admin</span>}
          {!removed && media.status === "processing" && <span className={`${styles.badge} ${styles.badgeWarn}`}><FontAwesomeIcon icon={faClock} /> Processing</span>}
          {!removed && media.status === "failed" && <span className={`${styles.badge} ${styles.badgeBad}`}><FontAwesomeIcon icon={faTriangleExclamation} /> Failed</span>}
        </div>
        {(media.posterBusy || replacingJob) && <span className={styles.busy} role="status">{replacingJob ? `Replacing… ${Math.round((replacingJob.progress ?? 0) * 100)}%` : "Updating…"}</span>}
        <button type="button" ref={setActivatorNodeRef} className={styles.handle} aria-label={`Reorder ${label}. Press space, then use the arrow keys.`} {...attributes} {...listeners}>
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
      </div>

      <div className={styles.cardBody}>
        {removed ? (
          <p className={styles.problem} role="note">Removed by admin{media.adminRemoveReason ? `: ${media.adminRemoveReason}` : ""}. This cannot be restored.</p>
        ) : media.status !== "ready" ? (
          <p className={styles.warning} role="note">{STATUS_TEXT[media.status]} {FAIL_REASON[media.failReason] ?? ""}{media.status === "processing" && video ? " Choose a poster picture to finish." : ""}</p>
        ) : null}

        <div className={styles.actions}>
          <span className={styles.moveBtns}>
            <button type="button" className={styles.iconBtn} aria-label={`Move ${label} earlier`} disabled={position === 1 || removed} onClick={() => onMove(position - 2)}><FontAwesomeIcon icon={faChevronLeft} /></button>
            <button type="button" className={styles.iconBtn} aria-label={`Move ${label} later`} disabled={position === total || removed} onClick={() => onMove(position)}><FontAwesomeIcon icon={faChevronRight} /></button>
          </span>
          {!video && !isCover && !unavailable && <button type="button" className={styles.textBtn} onClick={onSetCover} aria-label={`Set ${label} as cover`}><FontAwesomeIcon icon={faStar} /> Cover</button>}
          {!removed && <button type="button" className={styles.textBtn} onClick={onReplace} aria-label={`${media.status === "failed" ? "Retry with another file for" : "Replace"} ${label}`}><FontAwesomeIcon icon={faArrowsRotate} /> {media.status === "failed" ? "Retry" : "Replace"}</button>}
          <button type="button" className={`${styles.textBtn} ${styles.danger}`} onClick={onRemove} aria-label={`Delete ${label}`}><FontAwesomeIcon icon={faTrash} /> {removed ? "Dismiss" : "Delete"}</button>
          {!removed && <button type="button" className={styles.textBtn} aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen((v) => !v)} aria-label={`Details for ${label}`}><FontAwesomeIcon icon={faSliders} /> Details</button>}
        </div>

        {open && !removed && (
          <div id={detailsId} className={styles.details} role="group" aria-label={`Details for ${label}`}>
            <AltField media={media} itemName={itemName} position={position} onSave={onUpdate} />
            {variants.length > 0 && (
              <div className={styles.field}>
                <label htmlFor={`${detailsId}-variant`}>Applies to variant</label>
                <select id={`${detailsId}-variant`} className={styles.input} value={media.variantId ?? ""} onChange={(e) => onUpdate({ variantId: e.target.value || null })}>
                  <option value="">All variants</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{v.label || "Unnamed variant"}</option>)}
                </select>
              </div>
            )}
            {video && <button type="button" className={styles.textBtn} onClick={onPoster}><FontAwesomeIcon icon={faImage} /> Change poster</button>}
          </div>
        )}
      </div>
    </li>
  );
}

const suggestAltFor = (name, n) => suggestAlt(name, n);
export { faXmark };
