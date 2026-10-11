import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "../ui/ui.jsx";
import { formatDuration } from "@epicmkt/shared";
import * as store from "./mediaStore.js";
import styles from "./media.module.css";

// Pick the picture shown before a video plays: scrub to a moment, or upload your own image.
export function PosterDialog({ itemId, media, onClose }) {
  const open = Boolean(media);
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [time, setTime] = useState(1);
  const [busy, setBusy] = useState(false);
  const duration = media?.durationSec ?? 0;
  useEffect(() => { if (media) setTime(Math.min(1, duration || 1)); }, [media?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const v = videoRef.current; if (v && Number.isFinite(time)) { try { v.currentTime = time; } catch { /* not ready yet */ } } }, [time, open]);

  const done = async (input) => {
    setBusy(true);
    const row = await store.setPoster(itemId, media.id, input);
    setBusy(false);
    if (row) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Choose a poster picture" actions={<Button onClick={onClose}>Close</Button>}>
      {media && (
        <div className={styles.posterStage}>
          <video ref={videoRef} className={styles.posterVideo} src={media.url} preload="metadata" muted playsInline controls={false} aria-label="Video preview. Use the slider to pick a moment." />
          <label htmlFor="poster-time">Moment: {formatDuration(time)} of {formatDuration(duration)}</label>
          <input id="poster-time" className={styles.range} type="range" min={0} max={Math.max(0, duration)} step={0.1} value={time} onChange={(e) => setTime(Number(e.target.value))} />
          <div className={styles.dropBtns}>
            <Button variant="primary" disabled={busy} onClick={() => done({ timeSec: time })}>Use this frame</Button>
            <Button disabled={busy} onClick={() => fileRef.current?.click()}>Upload custom poster</Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className={styles.hidden} tabIndex={-1} aria-label="Custom poster file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) done({ file: f }); }} />
          </div>
        </div>
      )}
    </Modal>
  );
}
