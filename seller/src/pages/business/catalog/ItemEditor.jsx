import { cloneElement, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { ITEM_DETAIL_LIMITS, ITEM_PRICE_TYPES, SPEC_DEFAULT_GROUP, SPEC_GROUPS, SPEC_LIMITS, STATUS_CHOICES, emptyItemForm, formFromItem, statusFromCount, validateItemForm } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import MediaManager from "../../../components/mediaManager/MediaManager.jsx";
import useMediaManager from "../../../components/mediaManager/useMediaManager.js";
import ItemPreview from "./ItemPreview.jsx";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import styles from "./catalog.module.css";
import page from "./itemEditor.module.css";

const TYPE_LABELS = { fixed: "Fixed price", from: "Starting from", range: "Price range", free: "Free", contact: "Contact for price" };
const COUNTED_TEXT = { available: "Available", limited_stock: "Low stock, customers see a Low stock tag", out_of_stock: "Out of stock, customers cannot see it" };

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

export default function ItemEditor() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const limits = useQuery({ queryKey: ["media-limits"], queryFn: api.getMediaLimits, retry: false });
  const found = itemId ? catalog.data?.items.find((i) => i.id === itemId) : null;
  if (itemId && catalog.isLoading) return <div className={page.page}><p aria-busy="true">Loading item...</p></div>;
  if (itemId && (!found || found.removedByAdmin)) {
    return (
      <div className={page.page}>
        <h1>Item not found</h1>
        <p>This item does not exist or can no longer be edited.</p>
        <Link className={styles.primary} to="/business/catalog">Back to catalog</Link>
      </div>
    );
  }
  return <EditorBody key={found?.id ?? "new"} item={found ?? null} limits={limits.data ?? null} navigate={navigate} qc={qc} />;
}

function EditorBody({ item, limits, navigate, qc }) {
  const uid = useId();
  const formId = `${uid}-item-form`;
  const formRef = useRef(null);
  const previewRef = useRef(null);
  const compact = useMedia("(max-width: 56.25rem)");
  const [form, setForm] = useState(() => (item ? formFromItem(item) : emptyItemForm()));
  const [initial] = useState(() => JSON.stringify(form));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState(null);
  const [notice, setNotice] = useState("");
  const [openSections, setOpenSections] = useState({ basics: true, media: true });
  const [focusTick, setFocusTick] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const manager = useMediaManager({ itemId: item?.id ?? null, limits, fallbackPaths: item?.imagePaths ?? [] });
  const hasItem = Boolean(item || createdId);
  const pendingFocus = useRef(null);

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

  const dirty = JSON.stringify(form) !== initial || manager.dirty;
  const onClose = () => navigate("/business/catalog");
  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onClose();
  };
  useEffect(() => {
    if (!dirty) return undefined;
    const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
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
    setNotice("");
    setBusy(true);
    try {
      const id = await api.saveItem(item?.id ?? createdId ?? null, check.value);
      setCreatedId(id);
      const result = await manager.commit(id);
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      const base = item ? "Item saved." : "Item added as a draft.";
      if (result.failed || result.orderError) {
        const parts = [];
        if (result.failed) parts.push(`${result.failed} ${result.failed === 1 ? "file" : "files"} did not upload. Retry or remove ${result.failed === 1 ? "it" : "them"} below.`);
        if (result.orderError) parts.push(`The order could not be saved. ${result.orderError}`);
        setNotice(`${base} ${parts.join(" ")}`);
        return;
      }
      navigate("/business/catalog", { state: { notice: { tone: "ok", text: base } } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
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

  const waiting = manager.inFlight > 0;
  const status = busy ? (waiting ? `Finishing ${manager.inFlight} ${manager.inFlight === 1 ? "upload" : "uploads"}...` : "Saving...") : waiting ? `${manager.inFlight} ${manager.inFlight === 1 ? "upload is" : "uploads are"} still running. Save waits for ${manager.inFlight === 1 ? "it" : "them"}.` : "";
  const title = hasItem ? "Edit item" : "Add item";

  const actions = confirming ? (
    <div className={page.confirm}>
      <p className={styles.undo} role="alert">You have changes that are not saved. Leave without saving them?</p>
      <div className={styles.footBtns}>
        <button type="button" className={styles.ghost} onClick={() => setConfirming(false)} autoFocus>Keep editing</button>
        <button type="button" className={styles.primary} onClick={onClose}>Discard changes</button>
      </div>
    </div>
  ) : (
    <div className={page.confirm}>
      {error && <p className={ui.error} role="alert">{error}</p>}
      {status && <p className={page.status} role="status">{status}</p>}
      <div className={styles.footBtns}>
        <button type="button" className={styles.ghost} onClick={requestClose}>Cancel</button>
        <button type="submit" form={formId} className={styles.primary} disabled={busy}>{hasItem ? "Save changes" : "Add item"}</button>
      </div>
    </div>
  );

  return (
    <section className={page.page} aria-labelledby="item-title">
      <header className={page.head}>
        <button type="button" className={page.back} onClick={requestClose}>Back to catalog</button>
        <h1 id="item-title" className={page.title}>{title}</h1>
        <a className={page.previewLink} href="#item-preview" onClick={(e) => { e.preventDefault(); previewRef.current?.focus(); previewRef.current?.scrollIntoView?.({ block: "start" }); }}>Preview</a>
      </header>
      {notice && <p className={page.notice} role="alert">{notice}</p>}
      <div className={page.layout}>
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

        <Section id={`${uid}-media`} title="Photos and videos" meta={manager.tiles.length > 0 ? `${manager.tiles.length}` : undefined} open={isOpen("media")} compact={compact} onToggle={toggleSection("media")}>
          <MediaManager manager={manager} hasItem={hasItem} disabled={busy} />
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

        {!hasItem && <p className={styles.hint}>New items are saved as drafts. Use Show when you are ready for customers to see them.</p>}
      </form>
      <aside id="item-preview" ref={previewRef} tabIndex={-1} className={page.preview} aria-label="Live preview">
        <ItemPreview form={form} tiles={manager.tiles} />
      </aside>
      </div>
      <footer className={page.foot}>{actions}</footer>
    </section>
  );
}
