import { useEffect, useRef, useState } from "react";
import { ITEM_PRICE_TYPES, emptyItemForm, formFromItem, validateItemForm, inspectMedia, DB_AVAILABILITY, AVAILABILITY_OPTIONS } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { mediaUrl } from "../../../api/shape.js";
import Modal from "./Modal.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const AVAIL = AVAILABILITY_OPTIONS.filter((o) => DB_AVAILABILITY.includes(o.key));

const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

const photoProblem = async (file) => {
  const info = inspectMedia(new Uint8Array(await file.arrayBuffer()));
  if (!info.ok) return errorText({ code: info.reason });
  return info.kind === "image" ? null : errorText({ code: "unsupported_type" });
};

export default function ItemDialog({ open, item, onClose, onSave, onPhotosChanged }) {
  const [form, setForm] = useState(() => (item ? formFromItem(item) : emptyItemForm()));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(() => item?.imagePaths ?? []);
  const [queued, setQueued] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErrors, setPhotoErrors] = useState([]);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  useEffect(() => () => queuedRef.current.forEach((q) => URL.revokeObjectURL(q.url)), []);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const priced = ["fixed", "from", "range"].includes(form.priceType);

  const submit = async (e) => {
    e.preventDefault();
    const check = validateItemForm(form);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setError("");
    setBusy(true);
    try {
      await onSave(check.value, queued.map((q) => q.file));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const addPhotos = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    setPhotoBusy(true);
    setPhotoErrors([]);
    const problems = [];
    for (const file of files) {
      const bad = await photoProblem(file);
      if (bad) {
        problems.push(`${file.name}: ${bad}`);
        continue;
      }
      if (!item) {
        const url = URL.createObjectURL(file);
        setQueued((q) => [...q, { file, url }]);
        continue;
      }
      try {
        const { path } = await api.uploadItemPhoto(item.id, file);
        setSaved((list) => [...list, path]);
      } catch (err) {
        problems.push(`${file.name}: ${errorText(err)}`);
        if (err?.code === "photo_limit") break;
      }
    }
    setPhotoErrors(problems);
    setPhotoBusy(false);
    if (item) onPhotosChanged?.();
  };

  const removeSaved = async (path) => {
    setPhotoBusy(true);
    setPhotoErrors([]);
    try {
      await api.removeItemPhoto(path);
      setSaved((list) => list.filter((p) => p !== path));
      onPhotosChanged?.();
    } catch (err) {
      setPhotoErrors([errorText(err)]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const removeQueued = (url) => {
    URL.revokeObjectURL(url);
    setQueued((list) => list.filter((q) => q.url !== url));
  };

  const tiles = [
    ...saved.map((path) => ({ key: path, src: mediaUrl(path), remove: () => removeSaved(path) })),
    ...queued.map((q) => ({ key: q.url, src: q.url, remove: () => removeQueued(q.url) })),
  ];

  const field = (key, label, input) => (
    <div className={ui.field}>
      <label className={styles.stack}>
        <span className={ui.label}>{label}</span>
        {input}
      </label>
      {errors[key] && <span className={ui.error} role="alert">{errors[key]}</span>}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit item" : "Add item"} labelId="item-title" wide>
      <form className={styles.form} onSubmit={submit} noValidate>
        {field("name", "Name", <input className={ui.input} value={form.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} maxLength={120} />)}
        {field("description", "Description", <textarea className={ui.input} value={form.description} onChange={set("description")} maxLength={2000} />)}
        {field("section", "Section", <input className={ui.input} value={form.section} onChange={set("section")} maxLength={60} />)}
        {field("priceType", "Price type", (
          <select className={ui.input} value={form.priceType} onChange={set("priceType")}>
            {ITEM_PRICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        ))}
        {priced && field("price", form.priceType === "range" ? "Lowest price (KES)" : "Price (KES)", <input className={ui.input} inputMode="decimal" value={form.price} onChange={set("price")} aria-invalid={Boolean(errors.price)} />)}
        {form.priceType === "range" && field("priceMax", "Highest price (KES)", <input className={ui.input} inputMode="decimal" value={form.priceMax} onChange={set("priceMax")} aria-invalid={Boolean(errors.priceMax)} />)}
        {priced && field("salePrice", "Sale price (KES, optional)", <input className={ui.input} inputMode="decimal" value={form.salePrice} onChange={set("salePrice")} aria-invalid={Boolean(errors.salePrice)} />)}
        {field("unit", "Unit (optional, such as per cut)", <input className={ui.input} value={form.unit} onChange={set("unit")} maxLength={30} />)}
        {field("availability", "Availability", (
          <select className={ui.input} value={form.availability} onChange={set("availability")}>
            {AVAIL.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ))}
        <fieldset className={styles.photos}>
          <legend className={ui.label}>Photos</legend>
          {tiles.length > 0 && (
            <ul className={styles.photoGrid}>
              {tiles.map((t, i) => (
                <li key={t.key} className={styles.photoTile}>
                  {t.src ? <img src={t.src} alt="" /> : <span className={styles.photoBlank} aria-hidden="true" />}
                  {i === 0 && <span className={styles.photoCover}>Cover</span>}
                  <button type="button" className={styles.photoRemove} onClick={t.remove} disabled={photoBusy || busy} aria-label={`Remove photo ${i + 1}`}>Remove</button>
                </li>
              ))}
            </ul>
          )}
          <label className={`${styles.ghost} ${styles.photoAdd}`}>
            <input type="file" accept={PHOTO_TYPES} multiple className={styles.sr} onChange={addPhotos} disabled={photoBusy || busy} />
            <span>{photoBusy ? "Working..." : "Add photos"}</span>
          </label>
          <p className={styles.hint}>JPG, PNG or WebP, at least 200 pixels, up to 10 MB each. The first photo is the cover.{!item && " Photos upload when you add the item."}</p>
          {photoErrors.map((m) => <p key={m} className={ui.error} role="alert">{m}</p>)}
        </fieldset>
        {!item && <p className={styles.hint}>New items are saved as drafts. Use Show when you are ready for customers to see them.</p>}
        {error && <p className={ui.error} role="alert">{error}</p>}
        <div className={styles.formFoot}>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="submit" className={styles.primary} disabled={busy}>{item ? "Save changes" : "Add item"}</button>
        </div>
      </form>
    </Modal>
  );
}
