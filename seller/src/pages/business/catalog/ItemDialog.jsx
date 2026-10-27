import { cloneElement, useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { ITEM_DETAIL_LIMITS, ITEM_PRICE_TYPES, SPEC_DEFAULT_GROUP, SPEC_GROUPS, SPEC_LIMITS, STATUS_CHOICES, emptyItemForm, formFromItem, statusFromCount, validateItemForm, inspectMedia } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { mediaUrl } from "../../../api/shape.js";
import Modal from "./Modal.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const COUNTED_TEXT = { available: "Available", limited_stock: "Low stock, customers see a Low stock tag", out_of_stock: "Out of stock, customers cannot see it" };

const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

const SPEC_PRESETS = [
  { label: "Material", group: "Features & Specs" },
  { label: "Color", group: "Features & Specs" },
  { label: "Dimensions (D x W x H)", group: "Measurements" },
  { label: "Weight", group: "Measurements" },
  { label: "Brand", group: "Item details" },
  { label: "Special feature", group: "Features & Specs" },
  { label: "Mounting type", group: "Features & Specs" },
  { label: "Recommended uses", group: "Features & Specs" },
  { label: "Size", group: "Measurements" },
  { label: "Capacity", group: "Measurements" },
];

const SECTION_OF = {
  name: "basics", brand: "basics", section: "basics", shortDescription: "basics", description: "basics",
  priceType: "price", price: "price", priceMax: "price", salePrice: "price", unit: "price", availability: "price", stockCount: "price", lowStockThreshold: "price",
  highlights: "highlights", highlightsCount: "highlights",
  specs: "specs", specsCount: "specs",
  includes: "included", includesCount: "included",
  packSize: "terms", terms: "terms",
};

const photoProblem = async (file) => {
  const info = inspectMedia(new Uint8Array(await file.arrayBuffer()));
  if (!info.ok) return errorText({ code: info.reason });
  return info.kind === "image" ? null : errorText({ code: "unsupported_type" });
};

const useMedia = (query) => {
  const [matches, setMatches] = useState(() => (typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener?.("change", on);
    return () => mql.removeEventListener?.("change", on);
  }, [query]);
  return matches;
};

const moved = (list, from, to) => {
  const next = [...list];
  const [one] = next.splice(from, 1);
  next.splice(to, 0, one);
  return next;
};

function Section({ id, title, meta, open, compact, onToggle, children }) {
  const head = `${id}-head`;
  const body = `${id}-body`;
  return (
    <section className={styles.sec} aria-labelledby={head}>
      <h3 className={styles.secHead} id={head}>
        {compact ? (
          <button type="button" className={styles.secToggle} aria-expanded={open} aria-controls={body} onClick={onToggle}>
            <span className={styles.secLabel}>{title}</span>
            <span className={styles.secMeta}>
              {meta}
              <FontAwesomeIcon icon={faChevronDown} className={open ? styles.turned : ""} aria-hidden="true" />
            </span>
          </button>
        ) : (
          <span className={styles.secStatic}>{title}</span>
        )}
      </h3>
      <div id={body} className={styles.secBody} hidden={compact && !open}>{children}</div>
    </section>
  );
}

export default function ItemDialog({ open, item, onClose, onSave, onPhotosChanged }) {
  const uid = useId();
  const formId = `${uid}-item-form`;
  const formRef = useRef(null);
  const compact = useMedia("(max-width: 56.25rem)");
  const [form, setForm] = useState(() => (item ? formFromItem(item) : emptyItemForm()));
  const [initial] = useState(() => JSON.stringify(form));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(() => item?.imagePaths ?? []);
  const [queued, setQueued] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErrors, setPhotoErrors] = useState([]);
  const [openSections, setOpenSections] = useState({ basics: true });
  const [focusTick, setFocusTick] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  const pendingFocus = useRef(null);
  useEffect(() => () => queuedRef.current.forEach((q) => URL.revokeObjectURL(q.url)), []);

  useEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const el = formRef.current?.querySelector(`[data-focus="${want.key}"]`);
    if (el && !el.disabled) {
      pendingFocus.current = null;
      el.focus();
    } else if (want.tries <= 0 || !el) {
      pendingFocus.current = null;
    } else {
      pendingFocus.current = { ...want, tries: want.tries - 1 };
    }
  });

  useEffect(() => {
    if (!focusTick) return;
    const el = formRef.current?.querySelector('[aria-invalid="true"], [data-count-error]');
    if (!el) return;
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "center", behavior: calm ? "auto" : "smooth" });
  }, [focusTick]);

  const dirty = JSON.stringify(form) !== initial || queued.length > 0;
  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onClose();
  };
  const focusOn = (key) => { pendingFocus.current = { key, tries: 4 }; };
  const toggleSection = (id) => () => setOpenSections((o) => ({ ...o, [id]: !o[id] }));
  const isOpen = (id) => Boolean(openSections[id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const priced = ["fixed", "from", "range"].includes(form.priceType);
  const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));
  const setSpec = (i, k) => (e) => {
    const value = e.target.value;
    if (k === "group") focusOn(`spec-${i}-group`);
    setForm((f) => ({ ...f, specs: f.specs.map((s, n) => (n === i ? { ...s, [k]: value } : s)) }));
  };
  const addSpec = (label = "", group = SPEC_DEFAULT_GROUP) => {
    if (form.specs.length >= SPEC_LIMITS.rows) return;
    focusOn(`spec-${form.specs.length}-${label ? "value" : "label"}`);
    setForm((f) => ({ ...f, specs: [...f.specs, { group, label, value: "" }] }));
  };
  const removeSpec = (i) => () => setForm((f) => ({ ...f, specs: f.specs.filter((_, n) => n !== i) }));
  const setHighlight = (i, k) => (e) => setForm((f) => ({ ...f, highlights: f.highlights.map((h, n) => (n === i ? { ...h, [k]: e.target.value } : h)) }));
  const addHighlight = () => {
    focusOn(`hl-${form.highlights.length}-title`);
    setForm((f) => ({ ...f, highlights: [...f.highlights, { title: "", text: "" }] }));
  };
  const removeHighlight = (i) => () => setForm((f) => ({ ...f, highlights: f.highlights.filter((_, n) => n !== i) }));
  const moveHighlight = (i, dir) => () => {
    const to = i + dir;
    focusOn(`hl-${to}-${dir < 0 ? (to === 0 ? "down" : "up") : (to === form.highlights.length - 1 ? "up" : "down")}`);
    setForm((f) => ({ ...f, highlights: moved(f.highlights, i, to) }));
  };
  const setIncluded = (i) => (e) => setForm((f) => ({ ...f, includes: f.includes.map((t, n) => (n === i ? e.target.value : t)) }));
  const addIncluded = () => {
    focusOn(`inc-${form.includes.length}`);
    setForm((f) => ({ ...f, includes: [...f.includes, ""] }));
  };
  const removeIncluded = (i) => () => setForm((f) => ({ ...f, includes: f.includes.filter((_, n) => n !== i) }));
  const countOk = /^\d{1,6}$/.test(String(form.stockCount).trim());
  const lowOk = /^\d{1,4}$/.test(String(form.lowStockThreshold).trim());
  const resulting = countOk && lowOk ? statusFromCount(Number(form.stockCount), Number(form.lowStockThreshold)) : null;

  const submit = async (e) => {
    e.preventDefault();
    const check = validateItemForm(form);
    if (!check.ok) {
      setErrors(check.errors);
      setOpenSections((o) => ({ ...o, ...Object.fromEntries(Object.keys(check.errors).map((k) => [SECTION_OF[k] ?? "basics", true])) }));
      setFocusTick((t) => t + 1);
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

  const moveSaved = async (from, to) => {
    const before = saved;
    const next = moved(saved, from, to);
    setPhotoBusy(true);
    setPhotoErrors([]);
    setSaved(next);
    try {
      await api.reorderItemPhotos(item.id, next);
      onPhotosChanged?.();
    } catch (err) {
      setSaved(before);
      setPhotoErrors([errorText(err)]);
    } finally {
      setPhotoBusy(false);
    }
  };

  const moveQueued = (from, to) => setQueued((list) => moved(list, from, to));

  const tiles = [
    ...saved.map((path, n) => ({ key: path, src: mediaUrl(path), remove: () => removeSaved(path), move: (to) => moveSaved(n, to), at: n, count: saved.length })),
    ...queued.map((q, n) => ({ key: q.url, src: q.url, remove: () => removeQueued(q.url), move: (to) => moveQueued(n, to), at: n, count: queued.length })),
  ];
  const movePhoto = (t, i, dir) => () => {
    const to = t.at + dir;
    focusOn(`photo-${i + dir}-${dir < 0 ? (to === 0 ? "later" : "earlier") : (to === t.count - 1 ? "earlier" : "later")}`);
    t.move(to);
  };

  const field = (key, label, input) => (
    <div className={ui.field}>
      <label className={styles.stack}>
        <span className={ui.label}>{label}</span>
        {cloneElement(input, { "aria-invalid": errors[key] ? "true" : undefined, "aria-describedby": errors[key] ? `${uid}-${key}-err` : undefined })}
      </label>
      {errors[key] && <span id={`${uid}-${key}-err`} className={ui.error} role="alert">{errors[key]}</span>}
    </div>
  );
  const cell = (id, label, message, input) => (
    <div className={ui.field}>
      <label className={styles.stack}>
        <span className={ui.label}>{label}</span>
        {cloneElement(input, { "aria-invalid": message ? "true" : undefined, "aria-describedby": message ? `${uid}-${id}-err` : undefined })}
      </label>
      {message && <span id={`${uid}-${id}-err`} className={ui.error} role="alert">{message}</span>}
    </div>
  );
  // A text detail with a short explanation and a running count. The count is decoration; maxLength is what enforces the limit.
  const detail = (key, label, note, max, multiline = false) => {
    const Tag = multiline ? "textarea" : "input";
    return (
      <div className={ui.field}>
        <label className={styles.stack}>
          <span className={ui.label}>{label}</span>
          <Tag className={ui.input} value={form[key]} onChange={set(key)} maxLength={max} aria-invalid={Boolean(errors[key])} aria-describedby={`${key}-note`} />
        </label>
        <span id={`${key}-note`} className={styles.noteRow}>
          <span className={styles.hint}>{note}</span>
          <span className={styles.counter} aria-hidden="true">{form[key].length}/{max}</span>
        </span>
        {errors[key] && <span className={ui.error} role="alert">{errors[key]}</span>}
      </div>
    );
  };
  const countError = (key) => errors[key] && <span className={ui.error} role="alert" tabIndex={-1} data-count-error>{errors[key]}</span>;

  const usedLabels = new Set(form.specs.map((s) => String(s.label ?? "").trim().toLowerCase()));
  const specsFull = form.specs.length >= SPEC_LIMITS.rows;
  const specBuckets = SPEC_GROUPS.map((name) => ({
    name,
    rows: form.specs.map((s, i) => ({ s, i })).filter(({ s }) => (SPEC_GROUPS.includes(s.group) ? s.group : SPEC_DEFAULT_GROUP) === name),
  })).filter((g) => g.rows.length > 0);
  const hlMax = ITEM_DETAIL_LIMITS.highlights.rows;
  const incMax = ITEM_DETAIL_LIMITS.includes.rows;

  const footer = confirming ? (
    <div className={styles.footStack}>
      <p className={styles.undo} role="alert">You have changes that are not saved. Leave without saving them?</p>
      <div className={styles.footBtns}>
        <button type="button" className={styles.ghost} onClick={() => setConfirming(false)} autoFocus>Keep editing</button>
        <button type="button" className={styles.primary} onClick={onClose}>Discard changes</button>
      </div>
    </div>
  ) : (
    <div className={styles.footStack}>
      {error && <p className={ui.error} role="alert">{error}</p>}
      <div className={styles.footBtns}>
        <button type="button" className={styles.ghost} onClick={requestClose}>Cancel</button>
        <button type="submit" form={formId} className={styles.primary} disabled={busy}>{item ? "Save changes" : "Add item"}</button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={requestClose} title={item ? "Edit item" : "Add item"} labelId="item-title" responsive footer={footer}>
      <form id={formId} ref={formRef} className={styles.itemForm} onSubmit={submit} noValidate>
        <Section id={`${uid}-basics`} title="Basics" open={isOpen("basics")} compact={compact} onToggle={toggleSection("basics")}>
          {field("name", "Name", <input className={ui.input} value={form.name} onChange={set("name")} maxLength={120} />)}
          {detail("brand", "Brand (optional)", "The maker or label, such as Nike or Brookside.", ITEM_DETAIL_LIMITS.brand)}
          {field("section", "Section", <input className={ui.input} value={form.section} onChange={set("section")} maxLength={60} />)}
          {detail("shortDescription", "Short description (optional)", "One line customers see under the name.", ITEM_DETAIL_LIMITS.shortDescription)}
          {detail("description", "Description", "The full description customers read on the item page.", 2000, true)}
        </Section>

        <Section id={`${uid}-price`} title="Price and stock" open={isOpen("price")} compact={compact} onToggle={toggleSection("price")}>
          {field("priceType", "Price type", (
            <select className={ui.input} value={form.priceType} onChange={set("priceType")}>
              {ITEM_PRICE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          ))}
          {priced && field("price", form.priceType === "range" ? "Lowest price (KES)" : "Price (KES)", <input className={ui.input} inputMode="decimal" value={form.price} onChange={set("price")} />)}
          {form.priceType === "range" && field("priceMax", "Highest price (KES)", <input className={ui.input} inputMode="decimal" value={form.priceMax} onChange={set("priceMax")} />)}
          {priced && field("salePrice", "Sale price (KES, optional)", <input className={ui.input} inputMode="decimal" value={form.salePrice} onChange={set("salePrice")} />)}
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
                {field("stockCount", "How many do you have now?", <input className={ui.input} inputMode="numeric" value={form.stockCount} onChange={set("stockCount")} maxLength={6} />)}
                {field("lowStockThreshold", "Tell customers it is low when this many or fewer are left", <input className={ui.input} inputMode="numeric" value={form.lowStockThreshold} onChange={set("lowStockThreshold")} maxLength={4} />)}
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={form.showStockCount} onChange={toggle("showStockCount")} />
                  <span>When it is running low, show customers how many are left (for example Only 3 left)</span>
                </label>
                {resulting && <p className={styles.hint} data-testid="stock-result">Right now: {COUNTED_TEXT[resulting]}.</p>}
              </>
            )}
          </fieldset>
        </Section>

        <Section id={`${uid}-photos`} title="Photos" meta={tiles.length > 0 ? `${tiles.length}` : undefined} open={isOpen("photos")} compact={compact} onToggle={toggleSection("photos")}>
          {tiles.length > 0 && (
            <ul className={styles.photoGrid}>
              {tiles.map((t, i) => (
                <li key={t.key} className={styles.photoTile}>
                  {t.src ? <img src={t.src} alt="" /> : <span className={styles.photoBlank} aria-hidden="true" />}
                  {i === 0 && <span className={styles.photoCover}>Cover</span>}
                  <button type="button" className={styles.photoMove} data-focus={`photo-${i}-earlier`} onClick={movePhoto(t, i, -1)} disabled={photoBusy || busy || t.at === 0} aria-label={`Move photo ${i + 1} earlier`}>Move earlier</button>
                  <button type="button" className={styles.photoMove} data-focus={`photo-${i}-later`} onClick={movePhoto(t, i, 1)} disabled={photoBusy || busy || t.at === t.count - 1} aria-label={`Move photo ${i + 1} later`}>Move later</button>
                  <button type="button" className={styles.specRemove} onClick={t.remove} disabled={photoBusy || busy} aria-label={`Remove photo ${i + 1}`}>Remove</button>
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
        </Section>

        <Section id={`${uid}-highlights`} title="About this item" meta={form.highlights.length > 0 ? `${form.highlights.length} of ${hlMax}` : undefined} open={isOpen("highlights")} compact={compact} onToggle={toggleSection("highlights")}>
          <p className={styles.hint}>Optional. Short points that sell the item. The bold lead is optional and shows before the text.</p>
          {form.highlights.map((h, i) => (
            <div key={i} className={`${styles.rowCard} ${styles.specRow}`}>
              {cell(`hl-${i}-title`, `Highlight ${i + 1} title`, errors.highlights?.[i]?.title, <input className={ui.input} data-focus={`hl-${i}-title`} value={h.title} onChange={setHighlight(i, "title")} maxLength={ITEM_DETAIL_LIMITS.highlights.title} />)}
              {cell(`hl-${i}-text`, `Highlight ${i + 1} text`, errors.highlights?.[i]?.text, <input className={ui.input} value={h.text} onChange={setHighlight(i, "text")} maxLength={ITEM_DETAIL_LIMITS.highlights.text} />)}
              <div className={styles.rowActions}>
                <button type="button" className={styles.specRemove} data-focus={`hl-${i}-up`} onClick={moveHighlight(i, -1)} disabled={i === 0} aria-label={`Move highlight ${i + 1} up`}>Move up</button>
                <button type="button" className={styles.specRemove} data-focus={`hl-${i}-down`} onClick={moveHighlight(i, 1)} disabled={i === form.highlights.length - 1} aria-label={`Move highlight ${i + 1} down`}>Move down</button>
                <button type="button" className={styles.specRemove} onClick={removeHighlight(i)} aria-label={`Remove highlight ${i + 1}`}>Remove</button>
              </div>
            </div>
          ))}
          {countError("highlightsCount")}
          <div className={styles.countRow}>
            <button type="button" className={`${styles.ghost} ${styles.photoAdd}`} onClick={addHighlight} disabled={form.highlights.length >= hlMax}>Add highlight</button>
            <span className={styles.counter} aria-live="polite">{form.highlights.length} of {hlMax}</span>
          </div>
        </Section>

        <Section id={`${uid}-specs`} title="Specifications" meta={form.specs.length > 0 ? `${form.specs.length} of ${SPEC_LIMITS.rows}` : undefined} open={isOpen("specs")} compact={compact} onToggle={toggleSection("specs")}>
          <p className={styles.hint} id={`${uid}-spec-note`}>Optional. Short facts about this item. The group decides which section of the item page each fact appears under.</p>
          <ul className={styles.presets} aria-label="Quick add">
            {SPEC_PRESETS.map((p) => (
              <li key={p.label}>
                <button type="button" className={styles.presetChip} onClick={() => addSpec(p.label, p.group)} disabled={specsFull || usedLabels.has(p.label.toLowerCase())}>{p.label}</button>
              </li>
            ))}
          </ul>
          {specBuckets.map((g) => (
            <div key={g.name} className={styles.specGroup} role="group" aria-label={g.name}>
              <h4 className={styles.specGroupTitle}>{g.name}</h4>
              {g.rows.map(({ s, i }) => (
                <div key={i} className={`${styles.rowCard} ${styles.specRowGrouped}`}>
                  {cell(`spec-${i}-group`, "Group", errors.specs?.[i]?.group, (
                    <select className={ui.input} data-focus={`spec-${i}-group`} value={s.group || SPEC_DEFAULT_GROUP} onChange={setSpec(i, "group")}>
                      {SPEC_GROUPS.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  ))}
                  {cell(`spec-${i}-label`, "Label", errors.specs?.[i]?.label, <input className={ui.input} data-focus={`spec-${i}-label`} value={s.label} onChange={setSpec(i, "label")} maxLength={SPEC_LIMITS.label} />)}
                  {cell(`spec-${i}-value`, "Value", errors.specs?.[i]?.value, <input className={ui.input} data-focus={`spec-${i}-value`} value={s.value} onChange={setSpec(i, "value")} maxLength={SPEC_LIMITS.value} />)}
                  <button type="button" className={styles.specRemove} onClick={removeSpec(i)} aria-label={`Remove specification ${i + 1}`}>Remove</button>
                </div>
              ))}
            </div>
          ))}
          {countError("specsCount")}
          <div className={styles.countRow}>
            <button type="button" className={`${styles.ghost} ${styles.photoAdd}`} onClick={() => addSpec()} disabled={specsFull}>Add custom row</button>
            <span className={styles.counter} aria-live="polite">{form.specs.length} of {SPEC_LIMITS.rows}</span>
          </div>
        </Section>

        <Section id={`${uid}-included`} title="What is included" meta={form.includes.length > 0 ? `${form.includes.length} of ${incMax}` : undefined} open={isOpen("included")} compact={compact} onToggle={toggleSection("included")}>
          <p className={styles.hint}>Optional. List what comes with the item, such as a charger or a gift box.</p>
          {form.includes.map((t, i) => (
            <div key={i} className={`${styles.rowCard} ${styles.includeRow}`}>
              {cell(`inc-${i}`, `Included item ${i + 1}`, errors.includes?.[i], <input className={ui.input} data-focus={`inc-${i}`} value={t} onChange={setIncluded(i)} maxLength={ITEM_DETAIL_LIMITS.includes.text} />)}
              <button type="button" className={styles.specRemove} onClick={removeIncluded(i)} aria-label={`Remove included item ${i + 1}`}>Remove</button>
            </div>
          ))}
          {countError("includesCount")}
          <div className={styles.countRow}>
            <button type="button" className={`${styles.ghost} ${styles.photoAdd}`} onClick={addIncluded} disabled={form.includes.length >= incMax}>Add included item</button>
            <span className={styles.counter} aria-live="polite">{form.includes.length} of {incMax}</span>
          </div>
        </Section>

        <Section id={`${uid}-terms`} title="Pack size and terms" open={isOpen("terms")} compact={compact} onToggle={toggleSection("terms")}>
          {detail("packSize", "Pack size (optional)", "What one purchase contains, such as 6 pieces or 500 ml.", ITEM_DETAIL_LIMITS.packSize)}
          {detail("terms", "Terms (optional)", "Anything customers should know first, such as a deposit, delivery time or returns.", ITEM_DETAIL_LIMITS.terms, true)}
        </Section>

        {!item && <p className={styles.hint}>New items are saved as drafts. Use Show when you are ready for customers to see them.</p>}
      </form>
    </Modal>
  );
}
