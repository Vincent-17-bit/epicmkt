import { useEffect, useRef, useState } from "react";
import { ITEM_PRICE_TYPES, STATUS_CHOICES, emptyItemForm, formFromItem, statusFromCount, validateItemForm, inspectMedia } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { mediaUrl } from "../../../api/shape.js";
import Modal from "./Modal.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const COUNTED_TEXT = { available: "Available", limited_stock: "Low stock, customers see a Low stock tag", out_of_stock: "Out of stock, customers cannot see it" };

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
  const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));
  const countOk = /^\d{1,6}$/.test(String(form.stockCount).trim());
  const lowOk = /^\d{1,4}$/.test(String(form.lowStockThreshold).trim());
  const resulting = countOk && lowOk ? statusFromCount(Number(form.stockCount), Number(form.lowStockThreshold)) : null;

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
        {!form.trackStock && field("availability", "Availability", (
          <select className={ui.input} value={form.availability} onChange={set("availability")}>
            {STATUS_CHOICES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ))}
        {!form.trackStock && form.availability === "out_of_stock" && <p className={styles.hint}>Customers cannot see out of stock items. You can list it again any time with Back in stock.</p>}
        <fieldset className={styles.stockBox}>
          <legend className={ui.label}>Stock</legend>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={form.trackStock} onChange={toggle("trackStock")} />
            <span>Count my stock</span>
          </label>
          <p className={styles.hint}>
            {form.trackStock
              ? "Type how many you have. The item hides itself when you reach 0 and shows a Low stock tag when it is running low."
              : "Optional. Turn this on if you sell things you can count, like cakes or bottles. Services can skip it."}
          </p>
          {form.trackStock && (
            <>
              {field("stockCount", "How many do you have now?", <input className={ui.input} inputMode="numeric" value={form.stockCount} onChange={set("stockCount")} aria-invalid={Boolean(errors.stockCount)} maxLength={6} />)}
              {field("lowStockThreshold", "Tell customers it is low when this many or fewer are left", <input className={ui.input} inputMode="numeric" value={form.lowStockThreshold} onChange={set("lowStockThreshold")} aria-invalid={Boolean(errors.lowStockThreshold)} maxLength={4} />)}
              <label className={styles.checkRow}>
                <input type="checkbox" checked={form.showStockCount} onChange={toggle("showStockCount")} />
                <span>When it is running low, show customers how many are left (for example Only 3 left)</span>
              </label>
              {resulting && <p className={styles.hint} data-testid="stock-result">Right now: {COUNTED_TEXT[resulting]}.</p>}
            </>
          )}
        </fieldset>
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
