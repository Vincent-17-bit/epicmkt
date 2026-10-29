import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canHoverPreview, safePause, safePlay, useExclusivePlayback } from "@epicmkt/ui";
import { t } from "../i18n/index.js";
import styles from "./MediaVideo.module.css";

// The pop-up player for one video. The playback rules (never autoplay, muted by default, hover preview only with a real
// hover pointer and no reduced-motion, one video at a time) live in @epicmkt/ui so the item gallery follows the same ones.

function Player({ src, poster, label, onClose }) {
  const videoRef = useRef(null);
  const closeRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  useExclusivePlayback(videoRef);

  useEffect(() => {
    const el = videoRef.current;
    const sync = () => setPlaying(!el.paused && !el.ended);
    const tick = () => setProgress(el.duration > 0 ? el.currentTime / el.duration : 0);
    const events = [["play", () => setPlaying(true)], ["pause", () => setPlaying(false)], ["ended", () => setPlaying(false)], ["timeupdate", tick], ["loadedmetadata", sync]];
    events.forEach(([name, fn]) => el.addEventListener(name, fn));
    return () => events.forEach(([name, fn]) => el.removeEventListener(name, fn));
  }, []);

  const closeNow = useRef(onClose);
  closeNow.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    // Escape closes the player and nothing else. The item sheet underneath also closes on Escape, so this listens in the
    // capture phase and stops the event before the sheet sees it.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      closeNow.current();
    };
    document.addEventListener("keydown", onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
    };
  }, []);

  const togglePlay = () => (playing ? safePause(videoRef.current) : safePlay(videoRef.current));
  const toggleSound = () => {
    const next = !muted;
    videoRef.current.muted = next;
    setMuted(next);
  };
  const seek = (e) => {
    const el = videoRef.current;
    if (el.duration > 0) el.currentTime = Number(e.target.value) * el.duration;
  };

  return createPortal(
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} className={styles.player} src={src} poster={poster ?? undefined} muted playsInline preload="metadata" onClick={togglePlay} />
        <div className={styles.controls}>
          <button type="button" className={styles.control} onClick={togglePlay}>
            {playing ? t("video.pause") : t("video.play")}
          </button>
          <input type="range" className={styles.seek} min="0" max="1" step="0.001" value={progress} onChange={seek} aria-label="Seek" />
          <button type="button" className={styles.control} onClick={toggleSound} aria-pressed={!muted}>
            {muted ? t("video.soundOn") : t("video.soundOff")}
          </button>
          <button type="button" className={styles.control} onClick={onClose} ref={closeRef}>
            {t("video.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function MediaVideo({ src, poster, label = "" }) {
  const thumbRef = useRef(null);
  const openerRef = useRef(null);
  const [open, setOpen] = useState(false);
  useExclusivePlayback(thumbRef);

  const stopPreview = () => {
    const el = thumbRef.current;
    if (!el) return;
    safePause(el);
    try {
      el.currentTime = 0;
    } catch {
      /* not loaded yet */
    }
  };
  const startPreview = (e) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") return; // a finger is not a hover
    if (canHoverPreview()) safePlay(thumbRef.current);
  };
  const openPlayer = () => {
    stopPreview();
    setOpen(true);
  };
  const closePlayer = () => {
    setOpen(false);
    openerRef.current?.focus();
  };

  return (
    <>
      <button ref={openerRef} type="button" className={styles.thumb} onPointerEnter={startPreview} onPointerLeave={stopPreview} onClick={openPlayer} aria-haspopup="dialog" aria-label={label ? `${t("video.watch")}: ${label}` : t("video.watch")}>
        <video ref={thumbRef} className={styles.preview} src={poster ? src : `${src}#t=0.001`} poster={poster ?? undefined} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" disablePictureInPicture />
        <span className={styles.badge} aria-hidden="true" />
      </button>
      {open && <Player src={src} poster={poster} label={label || t("video.watch")} onClose={closePlayer} />}
    </>
  );
}
