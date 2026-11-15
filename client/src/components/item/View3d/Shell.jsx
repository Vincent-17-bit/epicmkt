import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Modal } from "@epicmkt/ui";
import { t } from "../../../i18n/index.js";
import { ZOOM, clampZoom, createEngine, kindsOf, reducedMotion } from "./engine.js";
import styles from "./Shell.module.css";

const fill = (key, values) => Object.entries(values).reduce((text, [k, v]) => text.replace(`{${k}}`, String(v)), t(key));

// "View in 3D" (C14): a button, and a modal with zoom, rotate and auto-orbit. The shell does not draw anything itself: it loads an engine
// (see engine.js) only when the modal opens, shows the seller's poster until the engine is ready, and when the engine cannot start it says
// so, keeps the poster and offers the photos. `load` is the engine factory, replaceable in tests.
export default function View3dShell({ view, name = "", onFallback = null, load = createEngine }) {
  const kinds = kindsOf(view);
  const [open, setOpen] = useState(false);
  if (kinds.length === 0 || !view?.poster) return null;
  return (
    <>
      <button type="button" className={styles.open} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span aria-hidden="true" className={styles.cube} />
        {t("view3d.open")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="view3d-title" variant="sheet" className={styles.modal}>
        {open && <Viewer view={view} kinds={kinds} name={name} onClose={() => setOpen(false)} onFallback={onFallback} load={load} />}
      </Modal>
    </>
  );
}

function Viewer({ view, kinds, name, onClose, onFallback, load }) {
  const titleId = useId();
  const stage = useRef(null);
  const engine = useRef(null);
  const [kind, setKind] = useState(kinds[0]);
  const [phase, setPhase] = useState("loading"); // loading | ready | failed
  const [zoom, setZoom] = useState(ZOOM.start);
  const [auto, setAuto] = useState(() => !reducedMotion());
  const [progress, setProgress] = useState(null);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  useEffect(() => {
    let cancelled = false;
    let mine = null;
    setPhase("loading");
    setProgress(null);
    setZoom(ZOOM.start);
    (async () => {
      try {
        mine = await load(kind, view);
        if (cancelled) { mine.destroy(); return; }
        engine.current = mine;
        await mine.mount(stage.current, { onProgress: (f) => !cancelled && setProgress(f) });
        if (cancelled) return;
        mine.setAutoRotate(autoRef.current);
        setPhase("ready");
      } catch {
        if (cancelled) return;
        const other = kinds.find((k) => k !== kind);
        if (other) setKind(other); // the model could not start (no WebGL, say): the photo spin is the next best thing
        else setPhase("failed");
      }
    })();
    return () => { cancelled = true; engine.current = null; mine?.destroy(); };
  }, [kind, view, kinds, load]);

  const zoomTo = useCallback((z) => { const next = engine.current?.setZoom(clampZoom(z)); if (typeof next === "number") setZoom(next); }, []);
  const rotate = (steps) => engine.current?.rotateBy(steps);
  const toggleAuto = () => { const next = !auto; setAuto(next); engine.current?.setAutoRotate(next); };
  const ready = phase === "ready";

  const onKey = (e) => {
    const handled = { ArrowLeft: () => rotate(-1), ArrowRight: () => rotate(1), "+": () => zoomTo(zoom + ZOOM.step), "=": () => zoomTo(zoom + ZOOM.step), "-": () => zoomTo(zoom - ZOOM.step), "0": () => zoomTo(ZOOM.start) }[e.key];
    if (!handled) return;
    e.preventDefault();
    handled();
  };

  return (
    <div className={styles.body}>
      <header className={styles.head}>
        <h2 id="view3d-title" className={styles.title}>{fill("view3d.title", { name })}</h2>
        <button type="button" className={styles.close} onClick={onClose} autoFocus>{t("view3d.close")}</button>
      </header>

      <div className={styles.stageWrap}>
        <div ref={stage} className={styles.stage} tabIndex={ready ? 0 : -1} role="group" aria-label={t("view3d.stage")} aria-describedby={`${titleId}-help`} onKeyDown={onKey} data-kind={kind} data-phase={phase} />
        {phase !== "ready" && <img className={styles.poster} src={view.poster} alt={phase === "failed" ? name : ""} />}
        {phase === "loading" && <p className={styles.loading} role="status">{progress ? fill("view3d.loadingPct", { n: Math.round(progress * 100) }) : t("view3d.loading")}</p>}
      </div>

      {phase === "failed" ? (
        <div className={styles.failed} role="alert">
          <p>{t("view3d.failed")}</p>
          <button type="button" className={styles.btn} onClick={() => { onClose(); onFallback?.(); }}>{t("view3d.photos")}</button>
        </div>
      ) : (
        <>
          <p id={`${titleId}-help`} className={styles.help}>{t("view3d.help")}</p>
          <div className={styles.tools} role="toolbar" aria-label={t("view3d.controls")}>
            <button type="button" className={styles.btn} disabled={!ready || zoom <= ZOOM.min} onClick={() => zoomTo(zoom - ZOOM.step)} aria-label={t("view3d.zoomOut")}>−</button>
            <button type="button" className={styles.btn} disabled={!ready || zoom >= ZOOM.max} onClick={() => zoomTo(zoom + ZOOM.step)} aria-label={t("view3d.zoomIn")}>+</button>
            <button type="button" className={styles.btn} disabled={!ready || zoom === ZOOM.start} onClick={() => zoomTo(ZOOM.start)}>{t("view3d.reset")}</button>
            <button type="button" className={styles.btn} disabled={!ready} onClick={() => rotate(-1)}>{t("view3d.left")}</button>
            <button type="button" className={styles.btn} disabled={!ready} onClick={() => rotate(1)}>{t("view3d.right")}</button>
            <button type="button" className={styles.btn} disabled={!ready} aria-pressed={auto} onClick={toggleAuto}>{t("view3d.auto")}</button>
            {kinds.length > 1 && (
              <span className={styles.modes} role="group" aria-label={t("view3d.mode")}>
                {kinds.map((k) => <button key={k} type="button" className={styles.btn} aria-pressed={k === kind} onClick={() => setKind(k)}>{t(`view3d.mode.${k}`)}</button>)}
              </span>
            )}
          </div>
          <p className={styles.zoomText} role="status" aria-live="polite">{ready ? fill("view3d.zoomNow", { n: Math.round(zoom * 100) }) : ""}</p>
        </>
      )}
    </div>
  );
}
