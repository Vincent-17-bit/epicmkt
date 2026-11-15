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
export default function ModelUpload({ itemId, scopeIds = [], model = null, poster = null, onChanged, previewLoad }) {
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
  const canSave = !busy && Boolean(file ? poster || posterFile : posterFile);

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
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      if (model) await api.removeMedia3d(model.path);
      if (poster) await api.removeMedia3d(poster.path);
      await onChanged?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const shown = localUrl || (model ? mediaUrl(model.path) : "");
  return (
    <section className={styles.block} aria-labelledby={`${uid}-t`}>
      <h3 id={`${uid}-t`} className={styles.h3}>3D model (.glb)</h3>
      <p className={styles.hint}>Up to {MEDIA3D.modelMaxBytes / MB} MB. Export a binary glTF (.glb) with everything inside it. Shoppers see your poster picture while it loads.</p>

      {shown && <ModelPreview url={shown} load={previewLoad} />}
      {model && !file && <p className={styles.status}>A model is uploaded{model.size ? ` (${(model.size / MB).toFixed(1)} MB)` : ""}.</p>}

      <div className={styles.row}>
        <label className={styles.file}>
          <span className={styles.btn}>{model || file ? "Replace the model" : "Choose a .glb file"}</span>
          <input type="file" accept=".glb,model/gltf-binary" className={styles.input} onChange={pickModel} disabled={busy} aria-label="Model file (.glb)" />
        </label>
        <label className={styles.file}>
          <span className={styles.btn}>{poster || posterFile ? "Replace the poster" : "Choose the poster picture"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" className={styles.input} onChange={pickPoster} disabled={busy} aria-label="Poster picture" />
        </label>
      </div>
      {(posterUrl || poster) && <img className={styles.thumb} src={posterUrl || mediaUrl(poster.path)} alt="Poster picture" />}
      {file && needsPoster && <p className={styles.note} role="status">Choose a poster picture to go with this model.</p>}
      {busy && <p role="status" className={styles.status}>{progress === null ? "Preparing…" : `Uploading ${Math.round(progress * 100)}%`}{progress !== null && <progress className={styles.progress} value={progress} max={1} aria-label="Upload progress" />}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!canSave} onClick={save}>{model ? "Save changes" : "Upload the model"}</button>
        {busy && <button type="button" className={styles.btn} onClick={() => abort.current?.abort()}>Cancel</button>}
        {(model || poster) && !busy && <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={remove}>Remove the model</button>}
      </div>
    </section>
  );
}
