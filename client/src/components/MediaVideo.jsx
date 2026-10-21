import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n/index.js";
import styles from "./MediaVideo.module.css";

// The one place customers see a video. The rules, in one spot so every screen behaves the same:
//   - Nothing ever autoplays: not on page load, not on scroll. No `autoplay` attribute, and play() is only called from a
//     user's own hover (below) or a tap on Play.
//   - Muted until the person turns sound on with the sound button. Playing never unmutes.
//   - Hover preview (muted, from the start) only where the device has a real hover pointer, `(hover: hover)`, and the
//     person has not asked for reduced motion. Leaving pauses it. Touch screens have no hover behaviour: a tap opens the
//     player, and the player starts only when the person taps Play.
//   - Only one video plays at a time: when one starts, every other one is paused.

const registry = new Set();

const safePlay = (el) => {
  try {
    const result = el.play?.();
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch {
    /* the browser refused; the person can tap Play */
  }
};
const safePause = (el) => {
  try {
    el.pause?.();
  } catch {
    /* nothing to pause */
  }
};
const matches = (query) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
// Checked at the moment of hovering, so a changed setting or a docked tablet is respected without a reload.
export const canHoverPreview = () => matches("(hover: hover)") && !matches("(prefers-reduced-motion: reduce)");

// Registers a <video> so that starting it pauses all the others.
function useExclusivePlayback(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    el.muted = true; // the muted *property* is what browsers honour; React does not always reflect the attribute
    registry.add(el);
    const onPlay = () => registry.forEach((other) => other !== el && safePause(other));
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("play", onPlay);
      registry.delete(el);
    };
  }, [ref]);
}

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

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

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
