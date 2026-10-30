import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faPlay, faVideo } from "@fortawesome/free-solid-svg-icons";
import { formatDuration, mediaLabel } from "@epicmkt/shared";
import styles from "./mediaManager.module.css";

const STAGE = { preparing: "Preparing", uploading: "Uploading", finishing: "Finishing" };

function Progress({ tile, label }) {
  const { fraction, stage } = tile.progress ?? {};
  const known = typeof fraction === "number";
  const pct = known ? Math.round(fraction * 100) : null;
  return (
    <div className={styles.overlay}>
      <div
        className={styles.bar}
        role="progressbar"
        aria-label={`${label} upload`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={pct === null ? `${STAGE[stage] ?? "Uploading"}` : `${pct} percent`}
        data-indeterminate={known ? "false" : "true"}
      >
        <span style={known ? { width: `${pct}%` } : undefined} />
      </div>
      <p className={styles.stage}>{known && stage === "uploading" ? `Uploading ${pct}%` : `${STAGE[stage] ?? "Uploading"}...`}</p>
    </div>
  );
}

export default function MediaTile({ tile, index, total, coverIndex, hasItem, drag, onMove, onRemove, onCancel, onRetry, onPreview, handleProps }) {
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef(null);
  const label = mediaLabel(tile.kind, index + 1);
  const video = tile.kind === "video";
  const busy = tile.status === "uploading";
  const locked = busy || tile.removing;
  const dragging = drag.key === tile.key;

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const askRemove = () => (tile.status === "saved" ? setConfirming(true) : onRemove(tile.key));

  return (
    <li
      className={styles.tile}
      data-tile={tile.key}
      data-kind={tile.kind}
      data-status={tile.status}
      data-dragging={dragging ? "true" : undefined}
      style={dragging ? { transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)` } : undefined}
      aria-label={label}
    >
      <div className={styles.frame}>
        {video ? (
          <button type="button" className={styles.previewBtn} onClick={() => onPreview(tile)} aria-label={`Preview video ${index + 1}`} disabled={tile.removing}>
            {tile.posterUrl ? <img src={tile.posterUrl} alt="" className={styles.img} draggable={false} /> : <span className={styles.blank}><FontAwesomeIcon icon={faVideo} aria-hidden="true" /></span>}
            <span className={styles.play} aria-hidden="true"><FontAwesomeIcon icon={faPlay} /></span>
          </button>
        ) : (
          <img src={tile.url} alt={`${label} preview`} className={styles.img} draggable={false} />
        )}
        <span className={styles.badges}>
          {index === coverIndex && <span className={styles.cover}>Cover</span>}
          {video && <span className={styles.tag}>Video{tile.durationSec > 0 ? ` ${formatDuration(tile.durationSec)}` : ""}</span>}
          {!hasItem && tile.status === "ready" && <span className={styles.tag}>Uploads on save</span>}
        </span>
        {busy && <Progress tile={tile} label={label} />}
        {tile.status === "error" && <div className={styles.overlay} data-tone="error"><p className={styles.errorText} role="alert">{tile.error}</p></div>}
      </div>
      {confirming ? (
        <div className={styles.confirm} role="group" aria-label={`Remove ${label}`}>
          <p>Remove this {video ? "video" : "photo"} from the item?</p>
          <button type="button" className={styles.danger} onClick={() => onRemove(tile.key)} disabled={tile.removing}>Remove</button>
          <button type="button" className={styles.action} ref={keepRef} onClick={() => setConfirming(false)}>Keep</button>
        </div>
      ) : (
        <div className={styles.actions}>
          <span className={styles.grip} {...handleProps(tile.key)} aria-hidden="true" data-grip><FontAwesomeIcon icon={faGripVertical} /><span>Drag</span></span>
          {busy ? (
            <button type="button" className={styles.action} data-act="cancel" onClick={() => onCancel(tile.key)} aria-label={`Cancel upload of ${label}`}>Cancel</button>
          ) : (
            <>
              <button type="button" className={styles.action} data-act="earlier" onClick={() => onMove(tile.key, -1)} disabled={index === 0 || locked} aria-label={`Move ${label} earlier`}>Move earlier</button>
              <button type="button" className={styles.action} data-act="later" onClick={() => onMove(tile.key, 1)} disabled={index === total - 1 || locked} aria-label={`Move ${label} later`}>Move later</button>
            </>
          )}
          {tile.status === "error" && <button type="button" className={styles.action} data-act="retry" onClick={() => onRetry(tile.key)} aria-label={`Retry ${label}`}>Retry</button>}
          <button type="button" className={styles.action} data-act="remove" onClick={askRemove} disabled={tile.removing} aria-label={`Remove ${label}`}>Remove</button>
        </div>
      )}
    </li>
  );
}
