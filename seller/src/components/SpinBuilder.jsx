import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as api from "../api/index.js";
import { mediaUrl } from "../api/shape.js";
import { errorText } from "../lib/errors.js";
import { SPIN, acceptFrame, compressFrame, frameIssues, move, sortFrames, startAt } from "../lib/spinPrep.js";
import styles from "./media3d.module.css";
import { spinPictureMs } from "@epicmkt/ui/view3d/spin";

let nextId = 1;
const ISSUE_TEXT = { too_few: `Add at least ${SPIN.min} pictures so the turn looks smooth.`, too_many: `Use at most ${SPIN.max} pictures.` };

// A photo spin: 12 to 72 pictures taken all the way round the item. On the item page buyers drag across the picture and the item
// turns, as if they were holding it. Pictures are put in file-name order, can be moved, previewed as a turn, and each one can be
// removed on its own (before or after it is uploaded). The first picture is the start frame and, when there is no poster yet, the poster.
// `frames` are the uploaded frames of this scope (sorted); `queue` holds pictures chosen on this device and not sent yet.
export default function SpinBuilder({ itemId, scopeIds = [], frames = [], poster = null, onChanged, compress = compressFrame }) {
  const uid = useId();
  const [queue, setQueue] = useState([]);
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(null);
  const [removing, setRemoving] = useState(null);
  const abort = useRef(null);
  const urls = useRef(new Map());

  const urlOf = (item) => {
    if (item.url) return item.url;
    if (item.path) return mediaUrl(item.path);
    if (!urls.current.has(item.id)) urls.current.set(item.id, URL.createObjectURL(item.file));
    return urls.current.get(item.id);
  };
  const forget = (item) => {
    const u = urls.current.get(item?.id);
    if (u) { URL.revokeObjectURL(u); urls.current.delete(item.id); }
  };
  useEffect(() => () => { abort.current?.abort(); for (const u of urls.current.values()) URL.revokeObjectURL(u); urls.current.clear(); }, []);

  // One list for the preview and the strip: the uploaded frames first, then the pictures still on this device.
  const saved = useMemo(() => frames.map((f) => ({ id: `s:${f.path}`, path: f.path, ...(f.url && { url: f.url }), saved: true })), [frames]);
  const all = useMemo(() => [...saved, ...queue], [saved, queue]);
  const total = all.length;
  useEffect(() => {
    if (!playing || total < 2) return undefined;
    // The same pace as the buyer's page (a full turn in 5 to 10 s), so the seller sees what buyers will see.
    const timer = setInterval(() => setAt((i) => (i + 1) % total), spinPictureMs(total));
    return () => clearInterval(timer);
  }, [playing, total]);

  const issues = frameIssues(total);
  const cur = Math.min(at, Math.max(0, total - 1));

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
  // Moving and "make it the start" work on the pictures not sent yet; uploaded frames keep their place unless moved with their own arrows.
  const shiftQueued = (i, to) => { setQueue((q) => move(q, i, to)); setAt(saved.length + to); };
  const dropQueued = (i) => { setQueue((q) => { forget(q[i]); return q.filter((_, n) => n !== i); }); setAt(0); };
  const makeStart = () => {
    if (saved.length === 0) { setQueue((q) => startAt(q, cur)); setAt(0); return; }
    reorderSaved(startAt(saved.map((s) => s.path), cur));
  };

  const reorderSaved = async (paths) => {
    setBusy(true);
    setError("");
    try {
      await api.reorderSpinFrames(itemId, { optionId: scopeIds[0] ?? "", paths });
      setAt(0);
      await onChanged?.();
    } catch (err) {
      setError(`The new order was not saved. ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  };
  const shiftSaved = (i, to) => {
    if (to < 0 || to >= saved.length) return;
    reorderSaved(move(saved.map((s) => s.path), i, to));
  };
  const dropSaved = async (i) => {
    const frame = saved[i];
    if (!frame) return;
    setRemoving(frame.path);
    setError("");
    try {
      await api.removeMedia3d(frame.path);
      setAt(0);
      await onChanged?.();
    } catch (err) {
      setError(`Picture ${i + 1} was not removed. ${errorText(err)}`);
    } finally {
      setRemoving(null);
    }
  };

  // Sends the pictures on this device, in order, after the uploaded ones. A picture leaves the queue as soon as it is stored, so a
  // failure part way keeps only the ones still to send: "Try again" never sends a picture twice.
  const build = async () => {
    setBusy(true);
    setError("");
    setPlaying(false);
    abort.current = new AbortController();
    const { signal } = abort.current;
    const start = frames.length;
    const list = [...queue];
    let sent = 0;
    try {
      for (let i = 0; i < list.length; i += 1) {
        setStep({ n: i + 1, of: list.length });
        const file = await compress(list[i].file);
        await api.uploadMedia3d(itemId, { role: "spin-frame", file, optionIds: scopeIds, position: start + i }, { signal });
        if (start + i === 0 && !poster) await api.uploadMedia3d(itemId, { role: "poster", file, optionIds: scopeIds }, { signal });
        sent += 1;
        forget(list[i]);
        setQueue((q) => q.filter((x) => x.id !== list[i].id));
      }
      setAt(0);
      await onChanged?.();
    } catch (err) {
      if (err?.code !== "upload_cancelled") setError(`${sent} of ${list.length} pictures were sent. ${errorText(err)}`);
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
      setAt(0);
      await onChanged?.();
    } catch (err) {
      setError(errorText(err));
      await onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const shown = all[cur];
  const canSend = queue.length > 0 && !busy && issues.length === 0;
  return (
    <section className={styles.block} aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className={styles.h3}>Photo spin (360°)</h3>
      <p className={styles.hint}>Buyers drag across the picture and the item turns all the way round, as if they were holding it. Good for shoes, bags, phones, furniture and gifts. Skip it for food, services and anything a few photos already show well.</p>
      <details className={styles.guide} open={frames.length === 0 && queue.length === 0}>
        <summary>How to take the pictures</summary>
        <ul>
          <li>Put the item on a turntable, or turn it a little between each picture.</li>
          <li>Take {SPIN.min} to {SPIN.max} pictures, one full turn. 24 gives a smooth result.</li>
          <li>Use even light, a plain background and the same distance every time.</li>
          <li>Name the files in order (1, 2, 3 …). We put them in that order for you.</li>
          <li>Only pictures of this item: a picture of something else makes the turn jump.</li>
        </ul>
      </details>

      {frames.length > 0 && (
        <p className={styles.status} role="status">
          {frames.length} {frames.length === 1 ? "picture is" : "pictures are"} uploaded{frames.length < SPIN.min ? `. Buyers see the spin once it has ${SPIN.min}: add ${SPIN.min - frames.length} more.` : ". Buyers can turn it on the item page."}
        </p>
      )}

      <div className={styles.row}>
        <label className={styles.file}>
          <span className={styles.btn}>{total ? "Add more pictures" : "Choose the pictures"}</span>
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" className={styles.input} onChange={add} disabled={busy || total >= SPIN.max} aria-label="Spin pictures" />
        </label>
        {frames.length > 0 && <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={removeSpin} disabled={busy}>Remove all spin pictures</button>}
      </div>
      {notes.map((n) => <p key={n} className={styles.note} role="status">{n}</p>)}

      {total > 0 && (
        <>
          {queue.length > 0 && <p className={styles.count} role="status">{total} of {SPIN.min} to {SPIN.max} pictures</p>}
          {queue.length > 0 && issues.map((c) => <p key={c} className={styles.error} role="alert">{ISSUE_TEXT[c]}</p>)}
          <div className={styles.spinPreview}>
            {shown && <img className={styles.frame} src={urlOf(shown)} alt={`Picture ${cur + 1} of ${total}`} />}
            {total > 1 && (
              <label className={styles.scrub}>
                <span>Turn the preview</span>
                <input type="range" min={0} max={total - 1} value={cur} onChange={(e) => { setPlaying(false); setAt(Number(e.target.value)); }} aria-valuetext={`Picture ${cur + 1} of ${total}`} />
              </label>
            )}
            <div className={styles.row}>
              {total > 1 && <button type="button" className={styles.btn} aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>{playing ? "Stop" : "Play the turn"}</button>}
              <button type="button" className={styles.btn} onClick={makeStart} disabled={cur === 0 || busy || (saved.length > 0 && cur >= saved.length)}>Make picture {cur + 1} the start</button>
            </div>
          </div>
          <ol className={styles.strip} aria-label="Pictures in order">
            {all.map((item, i) => {
              const q = i - saved.length;
              const gone = item.saved && removing === item.path;
              return (
                <li key={item.id} className={styles.cell} aria-current={i === cur ? "true" : undefined} data-state={item.saved ? "saved" : "new"}>
                  <button type="button" className={styles.cellImg} onClick={() => { setPlaying(false); setAt(i); }} aria-label={`Show picture ${i + 1}${item.file ? `, ${item.file.name}` : ", uploaded"}`}>
                    <img src={urlOf(item)} alt="" />
                    {!item.saved && <span className={styles.cellBadge}>New</span>}
                  </button>
                  <span className={styles.cellNum}>{i + 1}</span>
                  <span className={styles.cellTools}>
                    {item.saved ? (
                      <>
                        <button type="button" className={styles.mini} onClick={() => shiftSaved(i, i - 1)} disabled={i === 0 || busy} aria-label={`Move picture ${i + 1} earlier`}>←</button>
                        <button type="button" className={styles.mini} onClick={() => shiftSaved(i, i + 1)} disabled={i === saved.length - 1 || busy} aria-label={`Move picture ${i + 1} later`}>→</button>
                        <button type="button" className={`${styles.mini} ${styles.miniDanger}`} onClick={() => dropSaved(i)} disabled={busy || Boolean(removing)} aria-label={`Delete picture ${i + 1}`} title="Delete this picture">{gone ? "…" : "×"}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className={styles.mini} onClick={() => shiftQueued(q, q - 1)} disabled={q === 0 || busy} aria-label={`Move picture ${i + 1} earlier`}>←</button>
                        <button type="button" className={styles.mini} onClick={() => shiftQueued(q, q + 1)} disabled={q === queue.length - 1 || busy} aria-label={`Move picture ${i + 1} later`}>→</button>
                        <button type="button" className={`${styles.mini} ${styles.miniDanger}`} onClick={() => dropQueued(q)} disabled={busy} aria-label={`Remove picture ${i + 1}`} title="Remove this picture">×</button>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {busy && step && <p role="status" className={styles.status}>Sending picture {step.n} of {step.of}…<progress className={styles.progress} value={step.n - 1} max={step.of} aria-label="Spin upload progress" /></p>}
          {queue.length > 0 && (
            <div className={styles.row}>
              <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!canSend} onClick={build}>{frames.length ? `Upload ${queue.length} more ${queue.length === 1 ? "picture" : "pictures"}` : `Upload ${total} pictures`}</button>
              {busy && <button type="button" className={styles.btn} onClick={() => abort.current?.abort()}>Cancel</button>}
            </div>
          )}
          <p className={styles.hint}>Picture 1 is the start and also the poster shoppers see while the spin loads.</p>
        </>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  );
}
