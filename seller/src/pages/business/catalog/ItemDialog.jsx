import { useEffect, useRef, useState } from "react";
import { DETAIL_LIMITS, ITEM_PRICE_TYPES, SPEC_DEFAULT_GROUP, STATUS_CHOICES, emptyItemForm, formFromItem, statusFromCount, validateItemForm, inspectMedia } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { mediaUrl } from "../../../api/shape.js";
import Modal from "./Modal.jsx";
import { Field, HighlightsEditor, IncludesEditor, PhotosEditor, SpecsEditor } from "./ItemDetailEditors.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const COUNTED_TEXT = { available: "Available", limited_stock: "Low stock, customers see a Low stock tag", out_of_stock: "Out of stock, customers cannot see it" };

const PHOTO_TYPES = "image/jpeg,image/png,image/webp";
const NARROW = "(max-width: 56.25rem)";

const SECTIONS = [
  { id: "basics", title: "Basics", keys: ["name", "brand", "section", "shortDescription", "description"] },
  { id: "price", title: "Price and stock", keys: ["priceType", "price", "priceMax", "salePrice", "unit", "availability", "stockCount", "lowStockThreshold"] },
  { id: "photos", title: "Photos", keys: [] },
  { id: "highlights", title: "About this item", keys: ["highlights", "highlightsCount"] },
  { id: "specs", title: "Specifications", keys: ["specs", "specsCount"] },
  { id: "includes", title: "What is included", keys: ["includes", "includesCount"] },
  { id: "pack", title: "Pack size and terms", keys: ["packSize", "terms"] },
];

let seq = 0;
const keyed = (row) => ({ ...row, _k: ++seq });

const initialForm = (item) => {
  const f = item ? formFromItem(item) : emptyItemForm();
  return { ...f, specs: f.specs.map(keyed), highlights: f.highlights.map(keyed), includes: f.includes.map((text) => keyed({ text })) };
};

const forValidation = (f) => ({ ...f, includes: f.includes.map((r) => r.text) });

const shift = (list, i, by) => {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

const useNarrow = () => {
  const read = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW).matches;
  const [narrow, setNarrow] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(NARROW);
    const on = () => setNarrow(query.matches);
    query.addEventListener?.("change", on);
    return () => query.removeEventListener?.("change", on);
  }, []);
  return narrow;
};

const photoProblem = async (file) => {
  const info = inspectMedia(new Uint8Array(await file.arrayBuffer()));
  if (!info.ok) return errorText({ code: info.reason });
  return info.kind === "image" ? null : errorText({ code: "unsupported_type" });
};

function Section({ id, title, open, collapsible, onToggle, children }) {
  const panel = `item-section-${id}`;
  return (
    <section className={styles.itemSection} data-section={id}>
      <h3 className={styles.itemSectionHead}>
        {collapsible ? (
          <button type="button" className={styles.sectionToggle} aria-expanded={open} aria-controls={panel} onClick={onToggle}>
            <span>{title}</span>
            <span className={styles.sectionToggleState}>{open ? "Hide" : "Show"}</span>
          </button>
        ) : title}
      </h3>
      <div id={panel} className={styles.sectionBody} hidden={collapsible && !open}>{children}</div>
    </section>
  );
}

export default function ItemDialog({ open, item, onClose, onSave, onPhotosChanged }) {
  const [initial] = useState(() => initialForm(item));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(() => item?.imagePaths ?? []);
  const [queued, setQueued] = useState([]);
  const [orderChanged, setOrderChanged] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErrors, setPhotoErrors] = useState([]);
  const [openSections, setOpenSections] = useState({ basics: true });
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(null);
  const [focusTick, setFocusTick] = useState(0);
  const narrow = useNarrow();
  const formRef = useRef(null);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  useEffect(() => () => queuedRef.current.forEach((q) => URL.revokeObjectURL(q.url)), []);

  useEffect(() => {
    if (!pending) return;
    formRef.current?.querySelector(`[data-focus="${pending}"]`)?.focus();
    setPending(null);
  }, [pending]);

  useEffect(() => {
    if (!focusTick) return;
    const target = formRef.current?.querySelector('[aria-invalid="true"], [data-anchor="error"]');
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "center" });
  }, [focusTick]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));
  const patch = (k, fn) => setForm((f) => ({ ...f, [k]: fn(f[k]) }));
  const editRow = (k, field) => (i, name) => (e) => {
    const value = e.target.value;
    patch(k, (rows) => rows.map((r, n) => (n === i ? { ...r, [name ?? field]: value } : r)));
  };
  const priced = ["fixed", "from", "range"].includes(form.priceType);
  const countOk = /^\d{1,6}$/.test(String(form.stockCount).trim());
  const lowOk = /^\d{1,4}$/.test(String(form.lowStockThreshold).trim());
  const resulting = countOk && lowOk ? statusFromCount(Number(form.stockCount), Number(form.lowStockThreshold)) : null;

  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || queued.length > 0 || orderChanged;
  const requestClose = () => {
    if (busy) return;
    if (dirty) {
      setConfirming(true);
      return;
    }
    onClose();
  };

  const addRow = (k, row, field) => {
    const made = keyed(row);
    patch(k, (rows) => [...rows, made]);
    setPending(`${field.prefix}-${made._k}-${field.name}`);
  };

  const addSpec = (row, focus) => addRow("specs", { group: SPEC_DEFAULT_GROUP, label: "", value: "", ...row }, { prefix: "s", name: focus });
  const editSpec = (i, name) => (e) => {
    const value = e.target.value;
    patch("specs", (rows) => rows.map((r, n) => (n === i ? { ...r, [name]: value } : r)));
    if (name === "group") setPending(`s-${form.specs[i]._k}-group`);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const check = validateItemForm(forValidation(form));
    if (!check.ok) {
      setErrors(check.errors);
      const bad = SECTIONS.filter((s) => s.keys.some((k) => check.errors[k])).map((s) => s.id);
      setOpenSections((o) => ({ ...o, ...Object.fromEntries(bad.map((id) => [id, true])) }));
      setFocusTick((t) => t + 1);
      return;
    }
    setErrors({});
    setError("");
    setConfirming(false);
    setBusy(true);
    try {
      if (item && orderChanged) {
        await api.reorderItemPhotos(item.id, saved);
        setOrderChanged(false);
      }
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

  const movePhoto = (i, by) => {
    if (item) setSaved((list) => shift(list, i, by));
    else setQueued((list) => shift(list, i, by));
    setOrderChanged(true);
  };

  const tiles = [
    ...saved.map((path) => ({ key: path, src: mediaUrl(path), remove: () => removeSaved(path) })),
    ...queued.map((q) => ({ key: q.url, src: q.url, remove: () => removeQueued(q.url) })),
  ];

  const field = (key, label, input, counter) => (
    <Field label={label} error={errors[key]} counter={counter}>{input}</Field>
  );
  const len = (key, max) => `${String(form[key] ?? "").length}/${max}`;

  const section = (id, children) => {
    const meta = SECTIONS.find((s) => s.id === id);
    return (
      <Section id={id} title={meta.title} collapsible={narrow} open={Boolean(openSections[id])} onToggle={() => setOpenSections((o) => ({ ...o, [id]: !o[id] }))}>
        {children}
      </Section>
    );
  };

  const footer = (
    <div className={styles.itemFoot}>
      {error && <p className={ui.error} role="alert">{error}</p>}
      {confirming ? (
        <>
          <p className={styles.hint} role="status">You have changes that are not saved. Discard them?</p>
          <div className={styles.itemFootActions}>
            <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>Keep editing</button>
            <button type="button" className={styles.ghost} onClick={onClose}>Discard changes</button>
          </div>
        </>
      ) : (
        <div className={styles.itemFootActions}>
          <button type="button" className={styles.ghost} onClick={requestClose}>Cancel</button>
          <button type="submit" form="item-form" className={styles.primary} disabled={busy}>{item ? "Save changes" : "Add item"}</button>
        </div>
      )}
    </div>
  );

  return (
    <Modal open={open} onClose={requestClose} title={item ? "Edit item" : "Add item"} labelId="item-title" className={styles.itemModal} footer={footer}>
      <form id="item-form" ref={formRef} className={styles.itemForm} onSubmit={submit} noValidate>
        {section("basics", (
          <>
            {field("name", "Name", <input className={ui.input} value={form.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} maxLength={120} />)}
            {field("brand", "Brand (optional)", <input className={ui.input} value={form.brand} onChange={set("brand")} aria-invalid={Boolean(errors.brand)} maxLength={DETAIL_LIMITS.brand} />)}
            {field("section", "Section", <input className={ui.input} value={form.section} onChange={set("section")} aria-invalid={Boolean(errors.section)} maxLength={60} />)}
            {field("shortDescription", "Short description", <textarea className={ui.input} value={form.shortDescription} onChange={set("shortDescription")} aria-invalid={Boolean(errors.shortDescription)} maxLength={DETAIL_LIMITS.shortDescription} />, len("shortDescription", DETAIL_LIMITS.shortDescription))}
            {field("description", "Full description", <textarea className={ui.input} value={form.description} onChange={set("description")} aria-invalid={Boolean(errors.description)} maxLength={DETAIL_LIMITS.description} />, len("description", DETAIL_LIMITS.description))}
          </>
        ))}
        {section("price", (
          <>
            {field("priceType", "Price type", (
              <select className={ui.input} value={form.priceType} onChange={set("priceType")}>
                {ITEM_PRICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            ))}
            {priced && field("price", form.priceType === "range" ? "Lowest price (KES)" : "Price (KES)", <input className={ui.input} inputMode="decimal" value={form.price} onChange={set("price")} aria-invalid={Boolean(errors.price)} />)}
            {form.priceType === "range" && field("priceMax", "Highest price (KES)", <input className={ui.input} inputMode="decimal" value={form.priceMax} onChange={set("priceMax")} aria-invalid={Boolean(errors.priceMax)} />)}
            {priced && field("salePrice", "Sale price (KES, optional)", <input className={ui.input} inputMode="decimal" value={form.salePrice} onChange={set("salePrice")} aria-invalid={Boolean(errors.salePrice)} />)}
            {field("unit", "Unit (optional, such as per cut)", <input className={ui.input} value={form.unit} onChange={set("unit")} aria-invalid={Boolean(errors.unit)} maxLength={30} />)}
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
          </>
        ))}
        {section("photos", (
          <PhotosEditor
            tiles={tiles}
            busy={photoBusy || busy}
            uploading={photoBusy}
            accept={PHOTO_TYPES}
            note={`JPG, PNG or WebP, at least 200 pixels, up to 10 MB each. The first photo is the cover. Use Move earlier and Move later to change the order.${!item ? " Photos upload when you add the item." : ""}`}
            errors={photoErrors}
            onPick={addPhotos}
            onMove={movePhoto}
          />
        ))}
        {section("highlights", (
          <HighlightsEditor
            rows={form.highlights}
            errors={errors.highlights}
            countError={errors.highlightsCount}
            onField={editRow("highlights")}
            onAdd={() => addRow("highlights", { title: "", text: "" }, { prefix: "h", name: "title" })}
            onMove={(i, by) => patch("highlights", (rows) => shift(rows, i, by))}
            onRemove={(i) => patch("highlights", (rows) => rows.filter((_, n) => n !== i))}
          />
        ))}
        {section("specs", (
          <SpecsEditor
            rows={form.specs}
            errors={errors.specs}
            countError={errors.specsCount}
            onField={editSpec}
            onPreset={(p) => addSpec({ group: p.group, label: p.label }, "value")}
            onAdd={() => addSpec({}, "label")}
            onRemove={(i) => patch("specs", (rows) => rows.filter((_, n) => n !== i))}
          />
        ))}
        {section("includes", (
          <IncludesEditor
            rows={form.includes}
            errors={errors.includes}
            countError={errors.includesCount}
            onField={editRow("includes", "text")}
            onAdd={() => addRow("includes", { text: "" }, { prefix: "i", name: "text" })}
            onRemove={(i) => patch("includes", (rows) => rows.filter((_, n) => n !== i))}
          />
        ))}
        {section("pack", (
          <>
            {field("packSize", "Pack size (optional, such as 6 pieces)", <input className={ui.input} value={form.packSize} onChange={set("packSize")} aria-invalid={Boolean(errors.packSize)} maxLength={DETAIL_LIMITS.packSize} />, len("packSize", DETAIL_LIMITS.packSize))}
            {field("terms", "Terms (optional, such as returns or delivery)", <textarea className={ui.input} value={form.terms} onChange={set("terms")} aria-invalid={Boolean(errors.terms)} maxLength={DETAIL_LIMITS.terms} />, len("terms", DETAIL_LIMITS.terms))}
          </>
        ))}
        {!item && <p className={styles.hint}>New items are saved as drafts. Use Show when you are ready for customers to see them.</p>}
      </form>
    </Modal>
  );
}
