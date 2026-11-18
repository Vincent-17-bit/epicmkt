import { useEffect, useId, useRef, useState } from "react";
import { MEDIA3D, inspectGlb } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { mediaUrl } from "../api/shape.js";
import { errorText } from "../lib/errors.js";
import ModelPreview from "./ModelPreview.jsx";
import styles from "./media3d.module.css";

const MB = 1024 * 1024;
const REASON = {
  unsupported_type: "That is not a .glb model. Export it as a binary glTF (.glb).",
  too_large: `That model is over ${MEDIA3D.modelMaxBytes / MB} MB. Make it smaller and try again.`,
  corrupt: "That file could not be read as a .glb model. Export it again.",
  external_resources: "That model points to files stored elsewhere. Export a .glb that has everything inside it."
};
const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Checks a chosen file the way the server will: the name, the size, then the real bytes. Returns an error text or "". */
export async function checkModelFile(file) {
  if (!file) return "";
  if (!/\.glb$/i.test(file.name)) return REASON.unsupported_type;
  if (file.size > MEDIA3D.modelMaxBytes) return REASON.too_large;
  const seen = inspectGlb(new Uint8Array(await file.arrayBuffer()));
  return seen.ok ? "" : REASON[seen.reason] ?? REASON.corrupt;
}

// Upload, replace or remove the 3D model of an item (or of one option value). The model needs a poster picture: it is what shoppers
// see while the model loads, and a model without one is not shown. `rows` are this scope's model and poster rows, if any.
export default function ModelUpload({ itemId, scopeIds = [], model = null, poster = null, hasSpin = false, onChanged, previewLoad }) {
  const uid = useId();
  const [file, setFile] = useState(null);
  const [posterFile, setPosterFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [localUrl, setLocalUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const abort = useRef(null);

  useEffect(() => {
    if (!file) { setLocalUrl(""); return undefined; }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!posterFile) { setPosterUrl(""); return undefined; }
    const url = URL.createObjectURL(posterFile);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [posterFile]);
  useEffect(() => () => abort.current?.abort(), []);

  const pickModel = async (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    setError("");
    if (!chosen) return;
    const problem = await checkModelFile(chosen);
    if (problem) { setFile(null); setError(problem); return; }
    setFile(chosen);
  };
  const pickPoster = (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    setError("");
    if (!chosen) return;
    if (!POSTER_TYPES.includes(chosen.type)) { setError("The poster must be a JPG, PNG or WebP picture."); return; }
    setPosterFile(chosen);
  };

  const needsPoster = !poster && !posterFile;
  // The poster can be taken from the model itself: once the preview is showing, one tap (or none, for a new model with no poster yet).
  const engine = useRef(null);
  const [engineReady, setEngineReady] = useState(false);
  const onEngine = (e) => { engine.current = e; setEngineReady(typeof e?.capture === "function"); };
  const capturePoster = async (quiet = false) => {
    const blob = await engine.current?.capture?.({ type: "image/png" });
    if (!blob) { if (!quiet) setError("The picture could not be taken from the preview. Choose a poster picture instead."); return; }
    setError("");
    setPosterFile(new File([blob], "model-poster.png", { type: "image/png" }));
  };
  useEffect(() => {
    if (engineReady && file && needsPoster) capturePoster(true);
  }, [engineReady, file]); // eslint-disable-line react-hooks/exhaustive-deps
  // A model needs a poster. Without a new model file, only a new poster for an existing model (or spin) can be saved: a poster on its
  // own shows nothing to buyers, and the button used to say "Upload the model" with no model chosen.
  const canSave = !busy && (file ? Boolean(poster || posterFile) : Boolean(posterFile && (model || hasSpin)));

  const save = async () => {
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    const opts = { signal: abort.current.signal, onProgress: (f) => setProgress(f) };
    try {
      if (file) await api.uploadMedia3d(itemId, { role: "model-glb", file, optionIds: scopeIds }, opts);
      if (posterFile) await api.uploadMedia3d(itemId, { role: "poster", file: posterFile, optionIds: scopeIds }, opts);
      setFile(null);
      setPosterFile(null);
      await onChanged?.();
    } catch (err) {
      if (err?.code !== "upload_cancelled") setError(errorText(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  // Removing the model keeps the poster when a photo spin still uses it. Each part can also go on its own.
  const removeRows = async (rows) => {
    setBusy(true);
    setError("");
    try {
      for (const r of rows) await api.removeMedia3d(r.path);
      await onChanged?.();
    } catch (err) {
      setError(errorText(err));
      await onChanged?.();
    } finally {
      setBusy(false);
    }
  };
  const remove = () => removeRows([model, hasSpin ? null : poster].filter(Boolean));
  const removePoster = () => removeRows([poster].filter(Boolean));
  const clearChosen = () => { setFile(null); setError(""); };
  const clearPoster = () => { setPosterFile(null); setError(""); };

  const shown = localUrl || (model ? mediaUrl(model.path) : "");
  const saveLabel = file ? (model ? "Replace the model" : "Upload the model") : model || hasSpin ? "Save the new poster" : "Upload the model";
  return (
    <section className={styles.block} aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className={styles.h3}>3D model (.glb)</h3>
      <p className={styles.hint}>A 3D model lets buyers turn, tilt and zoom the item. You need a .glb file made in a 3D app or by a 3D scanning app (up to {MEDIA3D.modelMaxBytes / MB} MB, everything inside one file), and a poster picture buyers see while it loads.</p>

      {shown && <ModelPreview url={shown} load={previewLoad} onEngine={onEngine} />}
      {model && !file && (
        <div className={styles.fileRow}>
          <span className={styles.fileName}>A model is uploaded{model.size ? ` (${(model.size / MB).toFixed(1)} MB)` : ""}.</span>
          {!busy && <button type="button" className={`${styles.mini} ${styles.miniDanger}`} onClick={remove} aria-label="Delete the model" title="Delete the model">×</button>}
        </div>
      )}
      {file && (
        <div className={styles.fileRow}>
          <span className={styles.fileName}>{file.name} ({(file.size / MB).toFixed(1)} MB), not uploaded yet</span>
          {!busy && <button type="button" className={`${styles.mini} ${styles.miniDanger}`} onClick={clearChosen} aria-label={`Remove ${file.name}`} title="Remove this file">×</button>}
        </div>
      )}

      <div className={styles.row}>
        <label className={styles.file}>
          <span className={styles.btn}>{model || file ? "Choose another model" : "Choose a .glb file"}</span>
          <input type="file" accept=".glb,model/gltf-binary" className={styles.input} onChange={pickModel} disabled={busy} aria-label="Model file (.glb)" />
        </label>
        <label className={styles.file}>
          <span className={styles.btn}>{poster || posterFile ? "Replace the poster" : "Choose the poster picture"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className={styles.input} onChange={pickPoster} disabled={busy} aria-label="Poster picture" />
        </label>
      </div>
      {engineReady && !busy && (
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => capturePoster()}>{poster || posterFile ? "Take a new poster from the preview" : "Make the poster from the preview"}</button>
          <span className={styles.hint}>Turn the model to the view you want first.</span>
        </div>
      )}
      {(posterUrl || poster) && (
        <div className={styles.thumbWrap}>
          <img className={styles.thumb} src={posterUrl || poster.url || mediaUrl(poster.path)} alt="Poster picture" />
          {!busy && (posterUrl
            ? <button type="button" className={`${styles.mini} ${styles.miniDanger} ${styles.thumbX}`} onClick={clearPoster} aria-label="Remove the new poster" title="Remove the new poster">×</button>
            : <button type="button" className={`${styles.mini} ${styles.miniDanger} ${styles.thumbX}`} onClick={removePoster} aria-label="Delete the poster" title="Delete the poster">×</button>)}
          {posterUrl && <span className={styles.cellBadge}>New</span>}
        </div>
      )}
      {!file && !model && posterFile && !hasSpin && <p className={styles.note} role="status">Now choose the .glb model this poster belongs to.</p>}
      {file && needsPoster && <p className={styles.note} role="status">{engineReady ? "Making a poster from the preview… or choose your own picture." : "Choose a poster picture to go with this model."}</p>}
      {busy && <p role="status" className={styles.status}>{progress === null ? "Preparing…" : `Uploading ${Math.round(progress * 100)}%`}{progress !== null && <progress className={styles.progress} value={progress} max={1} aria-label="Upload progress" />}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!canSave} onClick={save}>{model && !file && !posterFile ? "Save changes" : saveLabel}</button>
        {busy && <button type="button" className={styles.btn} onClick={() => abort.current?.abort()}>Cancel</button>}
        {model && !busy && <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={remove}>Remove the model</button>}
      </div>
    </section>
  );
}
