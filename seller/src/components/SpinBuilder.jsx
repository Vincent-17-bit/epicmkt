import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as api from "../api/index.js";
import { errorText } from "../lib/errors.js";
import { SPIN, acceptFrame, compressFrame, frameIssues, move, sortFrames, startAt } from "../lib/spinPrep.js";
import styles from "./media3d.module.css";

let nextId = 1;
const ISSUE_TEXT = { too_few: `Add at least ${SPIN.min} pictures so the turn looks smooth.`, too_many: `Use at most ${SPIN.max} pictures.` };

// Build a photo spin: 12 to 72 pictures taken around the item. Pictures are put in file-name order, can be moved, previewed as a turn,
// and the first one (the start frame) is also the poster. Each is made smaller on this device before it is sent.
export default function SpinBuilder({ itemId, scopeIds = [], frames = [], poster = null, onChanged, compress = compressFrame }) {
  const uid = useId();
  const [queue, setQueue] = useState([]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(null);
  const abort = useRef(null);
  const urls = useRef(new Map());

  const urlOf = (item) => {
    if (!urls.current.has(item.id)) urls.current.set(item.id, URL.createObjectURL(item.file));
    return urls.current.get(item.id);
  };
  useEffect(() => () => { abort.current?.abort(); for (const u of urls.current.values()) URL.revokeObjectURL(u); urls.current.clear(); }, []);
  useEffect(() => {
    if (!playing || queue.length < 2) return undefined;
    const timer = setInterval(() => setAt((i) => (i + 1) % queue.length), 90);
    return () => clearInterval(timer);
  }, [playing, queue.length]);

  const issues = frameIssues(queue.length);
  const cur = Math.min(at, Math.max(0, queue.length - 1));

  const add = (e) => {
    const chosen = [...(e.target.files ?? [])];
    e.target.value = "";
    setError("");
    const skipped = chosen.filter((f) => acceptFrame(f));
    const fresh = sortFrames(chosen.filter((f) => !acceptFrame(f))).map((file) => ({ id: nextId++, file }));
    const room = SPIN.max - frames.length - queue.length;
    const kept = fresh.slice(0, Math.max(0, room));
    setNotes([
      ...(skipped.length ? [`${skipped.length} ${skipped.length === 1 ? "file was" : "files were"} left out: use JPG, PNG or WebP pictures.`] : []),
      ...(fresh.length > kept.length ? [`${fresh.length - kept.length} left out: a spin has at most ${SPIN.max} pictures.`] : [])
    ]);
    setQueue((q) => [...q, ...kept]);
  };
  const shift = (i, to) => { setQueue((q) => move(q, i, to)); setAt(to); };
  const drop = (i) => { setQueue((q) => q.filter((_, n) => n !== i)); setAt(0); };
  const makeStart = () => { setQueue((q) => startAt(q, cur)); setAt(0); };

  const build = async () => {
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    const { signal } = abort.current;
    try {
      for (let i = 0; i < queue.length; i += 1) {
        setStep({ n: i + 1, of: queue.length });
        const file = await compress(queue[i].file);
        await api.uploadMedia3d(itemId, { role: "spin-frame", file, optionIds: scopeIds, position: i }, { signal });
        if (i === 0 && !poster) await api.uploadMedia3d(itemId, { role: "poster", file, optionIds: scopeIds }, { signal });
      }
      setQueue([]);
      setAt(0);
      await onChanged?.();
    } catch (err) {
      if (err?.code !== "upload_cancelled") setError(errorText(err));
      await onChanged?.();
    } finally {
      setBusy(false);
      setStep(null);
    }
  };
  const removeSpin = async () => {
    setBusy(true);
    setError("");
    try {
      for (const f of frames) await api.removeMedia3d(f.path);
      await onChanged?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const shown = queue[cur];
  const total = useMemo(() => frames.length + queue.length, [frames.length, queue.length]);
  return (
    <section className={styles.block} aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className={styles.h3}>Photo spin</h3>
      <details className={styles.guide} open={frames.length === 0 && queue.length === 0}>
        <summary>How to take the pictures</summary>
        <ul>
          <li>Put the item on a turntable, or turn it a little between each picture.</li>
          <li>Take {SPIN.min} to {SPIN.max} pictures, one full turn. 24 gives a smooth result.</li>
          <li>Use even light, a plain background and the same distance every time.</li>
          <li>Name the files in order (1, 2, 3 …). We put them in that order for you.</li>
        </ul>
      </details>

      {frames.length > 0 && (
        <p className={styles.status}>
          A spin of {frames.length} pictures is uploaded.{" "}
          <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={removeSpin} disabled={busy}>Remove the spin</button>
        </p>
      )}

      {frames.length === 0 && (
        <>
          <label className={styles.file}>
            <span className={styles.btn}>{queue.length ? "Add more pictures" : "Choose the pictures"}</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className={styles.input} onChange={add} disabled={busy} aria-label="Spin pictures" />
          </label>
          {notes.map((n) => <p key={n} className={styles.note} role="status">{n}</p>)}

          {queue.length > 0 && (
            <>
              <p className={styles.count} role="status">{queue.length} of {SPIN.min} to {SPIN.max} pictures</p>
              {issues.map((c) => <p key={c} className={styles.error} role="alert">{ISSUE_TEXT[c]}</p>)}
              <div className={styles.spinPreview}>
                <img className={styles.frame} src={urlOf(shown)} alt={`Picture ${cur + 1} of ${queue.length}`} />
                <label className={styles.scrub}>
                  <span>Turn the preview</span>
                  <input type="range" min={0} max={queue.length - 1} value={cur} onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }} aria-valuetext={`Picture ${cur + 1} of ${queue.length}`} />
                </label>
                <div className={styles.row}>
                  <button type="button" className={styles.btn} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? "Stop" : "Play the turn"}</button>
                  <button type="button" className={styles.btn} onClick={makeStart} disabled={cur === 0}>Make picture {cur + 1} the start</button>
                </div>
              </div>
              <ol className={styles.strip} aria-label="Pictures in order">
                {queue.map((item, i) => (
                  <li key={item.id} className={styles.cell} aria-current={i === cur ? "true" : undefined}>
                    <button type="button" className={styles.cellImg} onClick={() => { setPlaying(false); setAt(i); }} aria-label={`Show picture ${i + 1}, ${item.file.name}`}>
                      <img src={urlOf(item)} alt="" />
                    </button>
                    <span className={styles.cellNum}>{i + 1}</span>
                    <span className={styles.cellTools}>
                      <button type="button" className={styles.mini} onClick={() => shift(i, i - 1)} disabled={i === 0 || busy} aria-label={`Move picture ${i + 1} earlier`}>←</button>
                      <button type="button" className={styles.mini} onClick={() => shift(i, i + 1)} disabled={i === queue.length - 1 || busy} aria-label={`Move picture ${i + 1} later`}>→</button>
                      <button type="button" className={styles.mini} onClick={() => drop(i)} disabled={busy} aria-label={`Remove picture ${i + 1}`}>×</button>
                    </span>
                  </li>
                ))}
              </ol>
              {busy && step && <p role="status" className={styles.status}>Sending picture {step.n} of {step.of}…<progress className={styles.progress} value={step.n - 1} max={step.of} aria-label="Spin upload progress" /></p>}
              {error && <p role="alert" className={styles.error}>{error}</p>}
              <div className={styles.row}>
                <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy || issues.length > 0} onClick={build}>Upload {total} pictures</button>
                {busy && <button type="button" className={styles.btn} onClick={() => abort.current?.abort()}>Cancel</button>}
              </div>
              <p className={styles.hint}>Picture 1 is the start and also the poster shoppers see while the spin loads.</p>
            </>
          )}
        </>
      )}
      {frames.length > 0 && error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  );
}
