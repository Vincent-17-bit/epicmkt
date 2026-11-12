import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronLeft, faCircle, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { CUSTOM_SIZE_STORED, checkGuide, checkOptions, guideFromServer, guidePayload, customSizePayload, emptyItemForm, formFromItem, formatDateTime, optionsFromServer, optionsPayload, validateCustomSize, validateItemForm } from "@epicmkt/shared";
import * as api from "../../../../api/index.js";
import { errorText } from "../../../../lib/errors.js";
import { ShopMark } from "../../../../components/Layout.jsx";
import Modal from "../Modal.jsx";
import LivePreview from "./LivePreview.jsx";
import { useMediaSlot } from "./MediaSlot.jsx";
import QualityPanel from "./Quality.jsx";
import { IconBtn } from "./parts.jsx";
import { useSettings } from "../../../../state/settings.js";
import { clearDraft, loadDraft, prefersCalm, storeDraft, useBreakpoint, useUnsavedGuard } from "./hooks.js";
import { firstErrorTarget, qualityChecks } from "./model.js";
import { useItemModel } from "./model/useItemModel.js";
import { visibleSteps } from "./steps/index.js";
import { useProductTypes } from "./steps/useProductTypes.js";
import { settleBrand, linkBrand } from "./brandValue.js";
import styles from "./editor.module.css";

const CATALOG = "/business/catalog";
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The route element for both /business/catalog/new and /business/catalog/:itemId/edit.
export default function ItemEditor() {
  const { itemId } = useParams();
  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const business = me.data?.business;
  // The editor sits outside the main shell, so a page opened straight from a link has not loaded the seller's settings yet.
  // A new item reads its starting values from them, so wait for them (a failure just means the built-in defaults).
  const settingsLoaded = useSettings((st) => st.loaded);
  const settings = useQuery({ queryKey: ["settings"], queryFn: async () => { const raw = await api.getSettings(); useSettings.getState().load(raw); return raw; }, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, enabled: !settingsLoaded });

  if (business?.status === "suspended") return <Navigate to="/business/notifications" replace />;
  if (catalog.isError) {
    return (
      <div className={styles.standalone} role="alert">
        <h1>We could not open the editor</h1>
        <p>{errorText(catalog.error)}</p>
        <button type="button" className={styles.btnPrimary} onClick={() => catalog.refetch()}>Try again</button>
      </div>
    );
  }
  if (catalog.isLoading || (!itemId && !settingsLoaded && settings.isLoading)) return <p className={styles.standalone} role="status">Loading</p>;
  const item = itemId ? catalog.data.items.find((i) => i.id === itemId && !i.removedByAdmin) ?? null : null;
  if (itemId && !item) {
    return (
      <div className={styles.standalone}>
        <h1>We could not find that item</h1>
        <p>It may have been deleted, or the link is old.</p>
        <Link className={styles.btnPrimary} to={CATALOG}>Back to your listings</Link>
      </div>
    );
  }
  const sections = [...new Set(catalog.data.items.map((i) => i.section).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return <EditorForm key={item?.id ?? "new"} item={item} sections={sections} category={business?.categoryName ?? ""} business={business} />;
}

function EditorForm({ item, sections, category, business }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const bp = useBreakpoint();
  const phone = bp === "phone";
  const isNew = !item;
  const draftId = item?.id ?? null;
  const catalogDefaults = useSettings((st) => st.settings.catalog);
  const backTo = `${CATALOG}${location.state?.from ?? ""}`;

  const seedRef = useRef(location.state?.leftover ?? []);
  const media = useMediaSlot(item, { onPhotosChanged: () => qc.invalidateQueries({ queryKey: ["catalog"] }), seed: seedRef.current });

  // The starting form is the saved item, or the draft kept on this device if it was made from this same item.
  const startRef = useRef(null);
  if (startRef.current === null) {
    // A new item starts from the seller's saved catalog defaults (Settings, Catalog defaults).
    const fresh = { ...emptyItemForm(), availability: catalogDefaults.default_availability === "unavailable" ? "out_of_stock" : catalogDefaults.default_availability, lowStockThreshold: String(catalogDefaults.low_stock_threshold), showStockCount: catalogDefaults.show_only_n_left };
    // The type picked on the Add item screen rides along in the route state; null means Other goods. Items with no type get no key at all.
    const picked = location.state && "productTypeId" in location.state ? { productTypeId: location.state.productTypeId ?? null } : {};
    const typed = item?.productTypeId ? { productTypeId: item.productTypeId } : {};
    const saved = item ? { ...formFromItem(item), ...typed } : { ...fresh, ...picked };
    const base = JSON.stringify(saved);
    const draft = loadDraft(draftId, base);
    startRef.current = { base, saved, form: draft ? { ...saved, ...draft.form } : saved, restoredAt: draft?.savedAt ?? null };
  }
  const baseRef = useRef(startRef.current.base);
  const { form, patch, replace } = useItemModel(startRef.current.form);
  const [restoredAt, setRestoredAt] = useState(startRef.current.restoredAt);
  // B07: an existing item's options come from their own read (axes, variants and stock counts). They join the form, and the starting
  // point the unsaved-changes check compares with, in one step, so loading them never shows as an edit.
  const hadOptions = useRef(false);
  const optionsRead = useQuery({ queryKey: ["itemOptions", item?.id], queryFn: () => api.getItemOptions(item.id), enabled: Boolean(item), retry: 1, staleTime: 0, gcTime: 0 });
  const optionsLoaded = useRef(false);
  useEffect(() => {
    if (optionsLoaded.current || !optionsRead.data) return;
    optionsLoaded.current = true;
    const loaded = optionsFromServer(optionsRead.data);
    if (loaded.axes.length === 0) return;
    hadOptions.current = true;
    baseRef.current = JSON.stringify({ ...JSON.parse(baseRef.current), options: loaded });
    if (!form.options) patch("options", loaded);
  }, [optionsRead.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // The seller's own size guide has its own read; like the options it joins the form and the unsaved-changes starting point in one step.
  const hadGuide = useRef(false);
  const guideRead = useQuery({ queryKey: ["itemSizeGuide", item?.id], queryFn: () => api.getItemSizeGuide(item.id), enabled: Boolean(item), retry: 1, staleTime: 0, gcTime: 0 });
  const guideLoaded = useRef(false);
  useEffect(() => {
    if (guideLoaded.current || guideRead.data === undefined) return;
    guideLoaded.current = true;
    const loaded = guideFromServer(guideRead.data);
    if (!loaded) return;
    hadGuide.current = true;
    baseRef.current = JSON.stringify({ ...JSON.parse(baseRef.current), sizeGuide: loaded });
    if (form.sizeGuide === undefined) patch("sizeGuide", loaded);
  }, [guideRead.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const productTypes = useProductTypes();
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [step, setStep] = useState(location.state?.step ?? "media");
  const [active, setActive] = useState("media");
  const [area, setArea] = useState(null);
  const [nudge, setNudge] = useState(0);
  const root = useRef(null);
  const pending = useRef(null);
  const firstStep = useRef(true);
  const landedOnField = useRef(false);

  const formDirty = JSON.stringify(form) !== baseRef.current;
  const dirty = formDirty || media.hasQueued;
  const { blocker, allow } = useUnsavedGuard(dirty);

  const checks = useMemo(() => qualityChecks(form, media.photoCount), [form, media.photoCount]);
  // The steps the seller sees (a step can hide itself with visibleWhen). Everything that numbers or steps through them reads this list.
  const typeName = productTypes.types.find((t) => t.id === form.productTypeId)?.name;
  const steps = visibleSteps({ form, errors, mediaCount: media.photoCount, typeName });

  // ---- Put the cursor somewhere, after the right step has had a chance to render ----
  const focusOn = useCallback((key) => {
    pending.current = { key, tries: 8 };
    setNudge((n) => n + 1);
  }, []);
  useEffect(() => {
    const want = pending.current;
    if (!want) return;
    const el = root.current?.querySelector(`[data-focus="${want.key}"]`);
    if (el && !el.disabled) {
      pending.current = null;
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: "center", behavior: prefersCalm() ? "auto" : "smooth" });
    } else if (want.tries > 0) {
      pending.current = { ...want, tries: want.tries - 1 };
      const t = setTimeout(() => setNudge((n) => n + 1), 30);
      return () => clearTimeout(t);
    } else {
      pending.current = null;
    }
    return undefined;
  }, [nudge, form, step, bp]);

  // Open a step (phone) or scroll to its section (everywhere else), then optionally land on a field.
  const goTo = useCallback((id, focus) => {
    if (phone) {
      // A jump that lands on a field already has the cursor where it belongs; the step heading must not take it back.
      landedOnField.current = Boolean(focus) && id !== step;
      setStep(id);
    } else {
      const sec = root.current?.querySelector(`#sec-${id}`);
      sec?.scrollIntoView?.({ block: "start", behavior: prefersCalm() ? "auto" : "smooth" });
      if (!focus) sec?.querySelector("h2")?.focus({ preventScroll: true });
      setActive(id);
    }
    if (focus) focusOn(focus);
  }, [phone, focusOn, step]);

  useEffect(() => {
    const want = location.state?.focus;
    if (want) goTo(location.state.step ?? "media", want);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A phone shows one step at a time: when it changes, start at the top of the new one and name it for screen readers.
  useEffect(() => {
    if (!phone) return;
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    if (landedOnField.current) {
      landedOnField.current = false;
      return;
    }
    document.documentElement.scrollTo?.({ top: 0 });
    root.current?.querySelector(`#sec-${step}-title`)?.focus({ preventScroll: true });
  }, [step, phone]);

  // On wider screens every section shows, so the navigation follows whichever one is under the header.
  useEffect(() => {
    if (phone || typeof IntersectionObserver === "undefined" || !root.current) return undefined;
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.dataset.step, e.isIntersecting));
      const first = steps.find((s) => seen.get(s.id));
      if (first) setActive(first.id);
    }, { rootMargin: "-25% 0px -60% 0px" });
    root.current.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [phone, bp, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Errors clear as the seller fixes them, without new ones appearing before they have asked to save ----
  useEffect(() => {
    const flagged = Object.keys(errors);
    if (!flagged.length) return;
    const check = validateItemForm(form);
    const left = check.ok ? {} : Object.fromEntries(flagged.filter((k) => check.errors[k]).map((k) => [k, check.errors[k]]));
    if (!same(left, errors)) setErrors(left);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Draft autosave: the form, not the files ----
  useEffect(() => {
    if (busyRef.current) return undefined;
    const t = setTimeout(() => {
      if (busyRef.current) return;
      if (JSON.stringify(form) !== baseRef.current) storeDraft(draftId, baseRef.current, form);
      else clearDraft(draftId);
    }, 500);
    return () => clearTimeout(t);
  }, [form, draftId]);

  // ---- Save ----
  const save = useCallback(async ({ stay }) => {
    if (busyRef.current) return;
    const check = validateItemForm(form);
    const optionsCheck = checkOptions(form.options);
    // Made to measure is checked only where the data layer can keep it (docs/requests/2026-11-07-b07-to-data-custom-size-storage.md).
    const customCheck = CUSTOM_SIZE_STORED ? validateCustomSize(form.customSize) : { ok: true, errors: {} };
    const guideCheck = form.sizeGuide ? checkGuide(form.sizeGuide) : { errors: {} };
    const optionErrors = { ...(optionsCheck.ok ? {} : optionsCheck.errors), ...Object.fromEntries(Object.entries(customCheck.errors).map(([k, v]) => [`custom.${k}`, v])) };
    if (!check.ok || Object.keys(optionErrors).length || Object.keys(guideCheck.errors).length) {
      const found = { ...(check.ok ? {} : check.errors), ...(Object.keys(optionErrors).length ? { options: optionErrors } : {}), ...(Object.keys(guideCheck.errors).length ? { sizeGuide: guideCheck.errors } : {}) };
      setErrors(found);
      setNotice(null);
      const target = firstErrorTarget(found);
      if (target) goTo(target.step, target.focus);
      return;
    }
    setErrors({});
    setError("");
    setNotice(null);
    busyRef.current = true;
    setBusy(true);
    try {
      // TODO(contract:A06) validateItemForm drops productTypeId; send it here until shared and seller_save_item carry it (docs/requests).
      const { brand, valueId } = await settleBrand(form);   // A18: one dictionary value per brand, however it was typed
      const fields = brand ? { ...check.value, brand } : check.value;   // empty brand: the form's own value, as before
      // B07: `options` goes along only for an item that has (or had) options, so every other item saves exactly as before.
      const options = optionsPayload(form.options, hadOptions.current);
      const body = { ...fields, ...("productTypeId" in form && { productTypeId: form.productTypeId }), ...(options !== undefined && { options }), ...(CUSTOM_SIZE_STORED && form.customSize !== undefined && { customSize: customSizePayload(form.customSize) }) };
      const id = await api.saveItem(item?.id ?? null, body);
      // Size guide: written after the item exists. Nothing is sent for an item whose guide was never loaded or touched.
      if (form.sizeGuide !== undefined || hadGuide.current) {
        await api.saveItemSizeGuide(id, guidePayload(form.sizeGuide));
        hadGuide.current = Boolean(guidePayload(form.sizeGuide));
      }
      await linkBrand(id, valueId, !!item?.brand);
      const { problems, leftover } = await media.flush(id);
      clearDraft(draftId);
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      // "New items start as Visible": publish a brand-new item straight away, but only when it is complete enough to show:
      // it has a picture and nothing went wrong while saving. Otherwise it stays a draft, exactly as before.
      let published = false;
      if (isNew && catalogDefaults.start_visible && media.photoCount > 0 && problems.length === 0) {
        try {
          await api.bulkItems("show", [id]);
          published = true;
        } catch { /* it stays a draft; the seller can show it from the list */ }
      }
      if (published) await qc.invalidateQueries({ queryKey: ["catalog"] });
      const base = isNew ? (published ? "Item added and visible to customers." : "Item added as a draft.") : "Item saved.";
      const result = problems.length ? { tone: "error", text: `${base} ${problems.join(" ")} Retry the failed files below.` } : { tone: "ok", text: base };
      if (!stay && problems.length === 0) {
        allow();
        navigate(backTo, { state: { notice: result } });
        return;
      }
      if (isNew) {
        allow();
        navigate(`${CATALOG}/${id}/edit`, { replace: true, state: { from: location.state?.from, step, notice: result, leftover } });
        return;
      }
      const fresh = qc.getQueryData(["catalog", "items"])?.items.find((i) => i.id === id);
      let next = fresh ? formFromItem(fresh) : form;
      if (fresh) {
        // formFromItem knows nothing of the type or the options: carry them over, re-reading the options so ids and stock are the saved ones.
        if ("productTypeId" in form) next = { ...next, productTypeId: form.productTypeId };
        if (form.options) {
          const again = optionsFromServer(await api.getItemOptions(id));
          hadOptions.current = again.axes.length > 0;
          if (again.axes.length > 0) next = { ...next, options: again };
        }
      }
      if (form.sizeGuide !== undefined) next = { ...next, sizeGuide: form.sizeGuide ? (guideFromServer(await api.getItemSizeGuide(id)) ?? null) : null };
      baseRef.current = JSON.stringify(next);
      replace(next);
      setNotice(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [form, item, media, draftId, qc, isNew, allow, navigate, backTo, location.state, step, goTo, catalogDefaults]);

  // A save from the new-item route lands on the edit route; show what happened there.
  useEffect(() => {
    if (location.state?.notice) {
      setNotice(location.state.notice);
      navigate(location.pathname, { replace: true, state: { ...location.state, notice: undefined, leftover: undefined } });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current({ stay: true });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ---- Leaving ----
  const leave = () => navigate(backTo);
  const startOver = () => {
    clearDraft(draftId);
    replace(startRef.current.saved);
    setRestoredAt(null);
    setErrors({});
  };
  const keepAndLeave = () => {
    storeDraft(draftId, baseRef.current, form);
    blocker.proceed();
  };
  const discardAndLeave = () => {
    clearDraft(draftId);
    blocker.proceed();
  };

  // ---- Focus in the form lights up its part of the preview ----
  const onFocusIn = (e) => setArea(e.target.closest?.("[data-area]")?.dataset.area ?? null);
  const onFocusOut = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArea(null); };

  const idx = steps.findIndex((x) => x.id === step);
  const draftish = isNew || item.draft || !item.visible;
  const secondary = draftish ? "Save as draft" : "Save and stay";
  const primary = isNew ? "Add item" : "Save changes";
  const problemCount = Object.keys(errors).length;
  const showAll = !phone;
  const visible = showAll ? steps : steps.filter((x) => x.id === step);
  const split = bp === "desktop" || bp === "wide";
  const shown = phone ? step : active;

  const saveState = busy ? "Saving..." : dirty ? "Unsaved changes" : isNew ? "New item" : "All changes saved";

  const stepProps = { form, patch, errors, category, sections, focusOn, media, busy, checks, isNew, goTo };
  const renderSection = (st) => <st.component key={st.id} {...stepProps} />;

  const stepButtons = (variant) => (
    <ol className={variant === "steps" ? styles.steps : styles.navList}>
      {steps.map((s, n) => {
        const done = s.done({ form, errors, mediaCount: media.photoCount });
        const current = shown === s.id;
        return (
          <li key={s.id}>
            <button type="button" className={styles.navBtn} aria-current={current ? (variant === "steps" ? "step" : "location") : undefined} onClick={() => goTo(s.id)}
              aria-label={variant === "steps" ? `Step ${n + 1}: ${s.label}${done ? ", done" : ""}` : undefined}>
              <span className={styles.navMark} data-done={done ? "" : undefined} aria-hidden="true">
                {done ? <FontAwesomeIcon icon={faCheck} /> : n + 1}
              </span>
              {variant !== "steps" && <span className={styles.navLabel}>{s.label}{done && <span className={styles.sr}>, done</span>}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );

  const nextStep = steps[idx + 1];
  const prevStep = steps[idx - 1];

  return (
    <div ref={root} className={styles.editor} data-bp={bp}>
      <header className={styles.head}>
        {/* The shop logo stays in view here, as on every other screen, and opens My listings. Unsaved changes are still guarded. */}
        <Link to={CATALOG} className={styles.brand} data-testid="editor-brand">
          <ShopMark name={business?.name} logoPath={business?.logoPath} />
          <span className={styles.brandText}>
            <strong className={styles.brandShop}>{business?.name ?? "Your shop"}</strong>
            <span className={styles.brandApp}>EpicMKT Seller</span>
          </span>
        </Link>
        <IconBtn icon={faChevronLeft} label="Back to your listings" onClick={leave} />
        <div className={styles.headTitle}>
          <h1>{isNew ? "Add item" : "Edit item"}</h1>
          <p className={styles.headSub}>
            {!isNew && <span className={styles.headName}>{item.name}</span>}
            <span className={styles.saveState} role="status" data-dirty={dirty ? "" : undefined}>
              <FontAwesomeIcon icon={dirty || busy ? faCircle : faCircleCheck} aria-hidden="true" /> {saveState}
            </span>
          </p>
        </div>
        <div className={styles.headActions}>
          {phone ? (
            <button type="button" className={styles.btnGhost} onClick={() => save({ stay: true })} disabled={busy}>{isNew ? "Save draft" : "Save"}</button>
          ) : (
            <>
              <button type="button" className={styles.btnGhost} onClick={() => save({ stay: true })} disabled={busy}>{secondary}</button>
              <button type="button" className={styles.btnPrimary} onClick={() => save({ stay: false })} disabled={busy}>{primary}</button>
            </>
          )}
        </div>
      </header>

      {phone && (
        <nav className={styles.stepper} aria-label="Steps">
          <p className={styles.stepLabel}>Step {idx + 1} of {steps.length}: <strong>{steps[idx].label}</strong></p>
          <div className={styles.track} role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={idx + 1} aria-valuetext={`Step ${idx + 1} of ${steps.length}: ${steps[idx].label}`}>
            <span className={styles.fill} style={{ inlineSize: `${((idx + 1) / steps.length) * 100}%` }} />
          </div>
          {stepButtons("steps")}
        </nav>
      )}
      {bp === "tablet" && <nav className={styles.tabs} aria-label="Sections">{stepButtons("tabs")}</nav>}

      <div className={styles.body}>
        {split && <nav className={styles.sideNav} aria-label="Sections">{stepButtons("side")}</nav>}

        <div className={styles.formCol} onFocusCapture={onFocusIn} onBlurCapture={onFocusOut}>
          <form className={styles.form} onSubmit={(e) => e.preventDefault()} noValidate aria-label={isNew ? "Add item" : "Edit item"}>
            {restoredAt && (
              <div className={styles.banner} role="status">
                <span>We brought back your unsaved changes from {formatDateTime(restoredAt)}.</span>
                <button type="button" className={styles.linkBtn} onClick={startOver}>Start over</button>
              </div>
            )}
            {notice && <p className={`${styles.banner} ${notice.tone === "error" ? styles.bannerBad : ""}`} role="status">{notice.text}</p>}
            {problemCount > 0 && <p className={`${styles.banner} ${styles.bannerBad}`} role="status">{`Fix ${problemCount} ${problemCount === 1 ? "thing" : "things"} before saving. We took you to the first one.`}</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            {visible.map(renderSection)}
          </form>
        </div>

        {split && <aside className={styles.previewCol}><LivePreview form={form} images={media.imageUrls} media={media.preview} area={area} /></aside>}
        {bp === "wide" && (
          <aside className={styles.checkCol} aria-label="Checklist">
            <QualityPanel checks={checks} onJump={goTo} headingLevel="h2" />
          </aside>
        )}
      </div>

      {phone && (
        <div className={styles.bottomBar}>
          <button type="button" className={styles.btnGhost} onClick={() => prevStep && setStep(prevStep.id)} disabled={!prevStep}>Back</button>
          {nextStep ? (
            <button type="button" className={styles.btnPrimary} onClick={() => setStep(nextStep.id)}>Next: {nextStep.short}</button>
          ) : (
            <button type="button" className={styles.btnPrimary} onClick={() => save({ stay: false })} disabled={busy}>{primary}</button>
          )}
        </div>
      )}

      <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} title="Leave without saving?" labelId="leave-title"
        footer={(
          <div className={styles.leaveBtns}>
            <button type="button" className={styles.btnPrimary} onClick={() => blocker.reset?.()} autoFocus>Keep editing</button>
            <button type="button" className={styles.btnGhost} onClick={keepAndLeave}>Leave, keep my draft</button>
            <button type="button" className={styles.btnGhost} onClick={discardAndLeave}>Discard changes</button>
          </div>
        )}>
        <p>You have changes that are not saved. We keep your edits on this device as a draft, so you can come back to them. Photos and videos are not kept.</p>
      </Modal>
    </div>
  );
}
