import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SORT_OPTIONS, TRACKER, activeChips, buildCatalogQuery, clearFilters, computeStats, enrichItems, filterCount, hasActiveFilters, parseCatalogQuery,
  priceBounds, reorderIds, runCatalogQuery, sectionsOf, showingSummary, statsFromRpc, trackerFilter,
} from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import BulkBar, { AvailabilityDialog, PriceDialog, SectionDialog } from "./BulkBar.jsx";
import FilterPanel from "./FilterPanel.jsx";
import ImportDialog from "./ImportDialog.jsx";
import ItemDialog from "./ItemDialog.jsx";
import ListRow from "./ListRow.jsx";
import ListingCard from "./ListingCard.jsx";
import Modal from "./Modal.jsx";
import SavedViews from "./SavedViews.jsx";
import Tracker from "./Tracker.jsx";
import { readDevicePref, storeDevicePref } from "./cardItem.js";
import styles from "./catalog.module.css";

const PAGE_SIZE = 60;
const MODES = [["comfortable", "Comfortable"], ["compact", "Compact"], ["list", "List"]];
const UNDO_MS = 8000;
const EMPTY = [];

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

const NOT_LIVE = {
  paused: "You paused your listing.",
  pending: "Your listing is waiting for approval.",
  expired: "Your subscription has expired.",
  suspended: "Your listing was suspended by EpicMKT.",
  live: "Your subscription is not active.",
};

export default function Catalog() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseCatalogQuery(params.toString()), [params]);
  const desktop = useMedia("(min-width: 1024px)");
  const searchRef = useRef(null);
  const [qText, setQText] = useState(query.q);
  const [mode, setModeState] = useState(() => readDevicePref("seller.catalog.view", "comfortable", MODES.map((m) => m[0])));
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState(query);
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(undefined);
  const [pending, setPending] = useState(() => new Set());
  const [undo, setUndo] = useState(null);
  const undoRef = useRef(null);
  const timerRef = useRef(null);
  const dragId = useRef(null);

  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const signals = useQuery({ queryKey: ["catalog", "signals"], queryFn: api.itemSignals });
  const stats = useQuery({ queryKey: ["catalog", "stats"], queryFn: () => api.catalogStats() });
  const views = useQuery({ queryKey: ["catalog", "views"], queryFn: api.getSavedViews });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ["catalog"] }), [qc]);

  const update = useCallback((patch, replace = false) => {
    const next = buildCatalogQuery({ ...query, ...patch });
    setParams(new URLSearchParams(next), { replace });
  }, [query, setParams]);

  useEffect(() => { setQText(query.q); }, [query.q]);
  useEffect(() => {
    if (qText === query.q) return undefined;
    const t = setTimeout(() => update({ q: qText }, true), 250);
    return () => clearTimeout(t);
  }, [qText, query.q, update]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const queryKey = buildCatalogQuery(query);
  useEffect(() => { setLimit(PAGE_SIZE); }, [queryKey]);

  const now = catalog.dataUpdatedAt || Date.now();
  const rawItems = catalog.data?.items ?? EMPTY;
  const shop = catalog.data?.shop ?? { slug: "", status: "live", live: true, planKey: "standard", itemsLimit: null };
  const items = useMemo(() => rawItems.filter((i) => !pending.has(i.id)), [rawItems, pending]);
  const enriched = useMemo(() => enrichItems(items, signals.data ?? EMPTY, { now }), [items, signals.data, now]);
  const filtered = useMemo(() => runCatalogQuery(enriched, query, now), [enriched, query, now]);
  const summary = useMemo(() => showingSummary(enriched, { shopLive: shop.live }), [enriched, shop.live]);
  const trackerStats = useMemo(() => (stats.data && pending.size === 0 ? statsFromRpc(stats.data) : computeStats(enriched)), [stats.data, pending, enriched]);
  const sections = useMemo(() => sectionsOf(enriched), [enriched]);
  const bounds = useMemo(() => priceBounds(enriched), [enriched]);
  const chips = useMemo(() => activeChips(query), [query]);
  const shown = filtered.slice(0, limit);
  const idsInOrder = useMemo(() => filtered.map((i) => i.id), [filtered]);
  const canMove = query.sort === "manual" && !hasActiveFilters(query);

  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [items]);

  const activeTile = useMemo(() => {
    const here = buildCatalogQuery({ ...query, q: "", sort: "manual" });
    return TRACKER.find((t) => buildCatalogQuery({ ...trackerFilter(t.key), sort: "manual" }) === here)?.key ?? null;
  }, [query]);

  const setMode = (m) => {
    setModeState(m);
    storeDevicePref("seller.catalog.view", m);
  };

  const run = useCallback(async (work, okText) => {
    setBusy(true);
    try {
      const out = await work();
      await refresh();
      if (okText) setNotice({ tone: "ok", text: typeof okText === "function" ? okText(out) : okText });
      return out;
    } catch (e) {
      setNotice({ tone: "error", text: errorText(e) });
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const commitDelete = useCallback(async () => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    clearTimeout(timerRef.current);
    setUndo(null);
    try {
      await api.bulkItems("delete", u.ids);
      setNotice({ tone: "ok", text: `${u.ids.length} ${u.ids.length === 1 ? "item" : "items"} deleted.` });
    } catch (e) {
      setNotice({ tone: "error", text: errorText(e) });
    } finally {
      await refresh();
      setPending(new Set());
    }
  }, [refresh]);

  useEffect(() => () => {
    const u = undoRef.current;
    if (u) {
      clearTimeout(timerRef.current);
      api.bulkItems("delete", u.ids).catch(() => {});
    }
  }, []);

  const startDelete = async (ids) => {
    await commitDelete();
    undoRef.current = { ids };
    setPending(new Set(ids));
    setUndo({ count: ids.length });
    setSelected(new Set());
    timerRef.current = setTimeout(commitDelete, UNDO_MS);
  };

  const undoDelete = () => {
    clearTimeout(timerRef.current);
    undoRef.current = null;
    setUndo(null);
    setPending(new Set());
  };

  const toggleSelect = useCallback((id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);

  const move = useCallback((id, dir) => {
    const from = idsInOrder.indexOf(id);
    const next = reorderIds(idsInOrder, from, from + dir);
    if (next !== idsInOrder) run(() => api.reorderItems(next));
  }, [idsInOrder, run]);

  const drag = {
    enabled: canMove && !busy,
    start: (e, id) => {
      dragId.current = id;
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    },
    over: (e) => { if (dragId.current) e.preventDefault(); },
    drop: (e, id) => {
      e.preventDefault();
      const from = idsInOrder.indexOf(dragId.current);
      const to = idsInOrder.indexOf(id);
      dragId.current = null;
      if (from >= 0 && to >= 0 && from !== to) run(() => api.reorderItems(reorderIds(idsInOrder, from, to)));
    },
  };

  const handlers = {
    select: toggleSelect,
    edit: (item) => setEditing(item),
    duplicate: (item) => run(() => api.duplicateItem(item.id), "Copy added as a draft."),
    toggle: (item) => run(() => api.bulkItems(item.visible && !item.draft ? "hide" : "show", [item.id]), item.visible && !item.draft ? "Item hidden." : "Item is now showing."),
    confirm: (item) => run(() => api.bulkItems("confirm_prices", [item.id]), "Price confirmed."),
    move,
  };

  const selectedIds = [...selected];
  const selectedItems = enriched.filter((i) => selected.has(i.id));

  const onBulk = async (action) => {
    if (action === "hide") run(() => api.bulkItems("hide", selectedIds), (r) => `${r.affected} hidden.`);
    else if (action === "show") run(() => api.bulkItems("show", selectedIds), (r) => `${r.affected} now showing.`);
    else if (action === "confirm") run(() => api.bulkItems("confirm_prices", selectedIds), (r) => `${r.affected} prices confirmed.`);
    else if (action === "delete") startDelete(selectedIds);
    else setDialog(action);
  };

  const applyBulk = async (work, text) => {
    const out = await work();
    await refresh();
    setNotice({ tone: "ok", text: text(out) });
    setDialog(null);
    setSelected(new Set());
  };

  const openSheet = () => { setDraft(query); setSheet(true); };

  const filterNode = (q, onChange) => <FilterPanel query={q} onChange={onChange} sections={sections} bounds={bounds} />;

  const limitText = shop.itemsLimit ? `${enriched.length} of ${shop.itemsLimit} items used` : `${enriched.length} items`;
  const cards = mode !== "list";

  if (catalog.isLoading) return <div className={styles.page}><p className={ui.muted} role="status">Loading your listings.</p></div>;
  if (catalog.isError) return <div className={styles.page}><div className={`${ui.banner} ${ui.tone_danger}`} role="alert"><h2>We could not load your listings</h2><p>{errorText(catalog.error)}</p></div></div>;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>My listings</h1>
          <p className={ui.muted}>{limitText}</p>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.primary} onClick={() => setEditing(null)}>Add item</button>
          <button type="button" className={styles.ghost} onClick={() => setDialog("import")}>Import items{shop.planKey !== "premium" ? " (Premium)" : ""}</button>
        </div>
      </header>

      {!shop.live && (
        <div className={`${ui.banner} ${ui.tone_danger}`} data-testid="shop-not-live">
          <h2>Your shop is not live</h2>
          <p>{NOT_LIVE[shop.status] ?? NOT_LIVE.live} No items are showing to customers until it is live again. You can keep editing your items.</p>
          <p><Link className={ui.link} to="/business/subscription">Open subscription</Link></p>
        </div>
      )}

      <section className={styles.summary} aria-label="Showing to customers" data-testid="showing-summary">
        <strong>{summary.text}</strong>
        {summary.reasons.length > 0 && <span className={styles.summaryReasons}>{summary.reasons.map((r) => r.label).join(". ")}.</span>}
      </section>

      {enriched.length > 0 && <Tracker stats={trackerStats} activeKey={activeTile} onPick={(key) => update({ ...trackerFilter(key), sort: query.sort })} />}

      {enriched.length === 0 ? (
        <section className={styles.empty} data-testid="empty-start">
          <h2>Add your first item</h2>
          <ol>
            <li>Add an item with a name, price and availability.</li>
            <li>Items start as drafts. Choose Show when you are ready.</li>
            <li>Customers then see it on your page and can call or WhatsApp you.</li>
          </ol>
          <div className={styles.headActions}>
            <button type="button" className={styles.primary} onClick={() => setEditing(null)}>Add your first item</button>
            <button type="button" className={styles.ghost} onClick={() => setDialog("import")}>Import from a spreadsheet{shop.planKey !== "premium" ? " (Premium)" : ""}</button>
          </div>
        </section>
      ) : (
        <div className={styles.layout}>
          {desktop && <aside className={styles.side} aria-label="Filters">{filterNode(query, (patch) => update(patch))}</aside>}
          <div className={styles.main}>
            <div className={styles.toolbar} role="search">
              <label className={styles.searchBox}>
                <span className={styles.sr}>Search listings</span>
                <input
                  ref={searchRef}
                  className={styles.text}
                  type="search"
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  placeholder="Search name, tags, section. Press / to focus"
                  aria-label="Search listings"
                  maxLength={100}
                />
              </label>
              <label className={styles.stackInline}>
                <span className={styles.sr}>Sort</span>
                <select className={styles.select} value={query.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort">
                  {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>
              <div className={styles.modes} role="group" aria-label="View mode">
                {MODES.map(([key, label]) => <button key={key} type="button" className={styles.modeBtn} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}
              </div>
              {!desktop && <button type="button" className={styles.ghost} onClick={openSheet}>Filters{filterCount(query) ? ` (${filterCount(query)})` : ""}</button>}
            </div>

            <SavedViews
              views={views.data ?? EMPTY}
              currentQuery={buildCatalogQuery(query)}
              onApply={(q) => setParams(new URLSearchParams(q))}
              onSave={async (next) => { await api.saveSavedViews(next); await qc.invalidateQueries({ queryKey: ["catalog", "views"] }); }}
            />

            <div className={styles.resultBar}>
              <span data-testid="result-count" aria-live="polite">{filtered.length} of {enriched.length} {enriched.length === 1 ? "item" : "items"}</span>
              {chips.length > 0 && (
                <ul className={styles.activeChips} aria-label="Active filters">
                  {chips.map((c) => (
                    <li key={c.id}><button type="button" className={styles.chipBtn} onClick={() => update(c.patch)} aria-label={`Remove filter ${c.label}`}>{c.label} <span aria-hidden="true">x</span></button></li>
                  ))}
                  <li><button type="button" className={styles.ghost} onClick={() => update(clearFilters(query))}>Clear all</button></li>
                </ul>
              )}
            </div>

            {selected.size > 0 && (
              <BulkBar
                count={selected.size}
                total={filtered.length}
                allSelected={filtered.length > 0 && filtered.every((i) => selected.has(i.id))}
                busy={busy}
                onSelectAll={() => setSelected(new Set(filtered.map((i) => i.id)))}
                onClear={() => setSelected(new Set())}
                onAction={onBulk}
              />
            )}

            {notice && <p className={notice.tone === "error" ? ui.error : styles.ok} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
            {undo && (
              <p className={styles.undo} role="status" data-testid="undo-bar">
                {undo.count} {undo.count === 1 ? "item" : "items"} deleted.
                <button type="button" className={styles.ghost} onClick={undoDelete}>Undo</button>
              </p>
            )}

            {filtered.length === 0 ? (
              <section className={styles.empty} data-testid="empty-results">
                <h2>No items match</h2>
                <p>Try different words, or clear the filters to see all {enriched.length} items.</p>
                <button type="button" className={styles.primary} onClick={() => update({ ...clearFilters(query), q: "" })}>Clear filters</button>
              </section>
            ) : (
              <>
                <ul className={`${cards ? styles.grid : styles.list} ${mode === "compact" ? styles.compact : ""}`} data-mode={mode} data-testid="listing-grid">
                  {shown.map((item, i) => {
                    const Row = cards ? ListingCard : ListRow;
                    return (
                      <Row
                        key={item.id}
                        item={item}
                        shop={shop}
                        selected={selected.has(item.id)}
                        handlers={handlers}
                        canMove={canMove}
                        isFirst={i === 0}
                        isLast={i === filtered.length - 1}
                        busy={busy}
                        drag={drag}
                      />
                    );
                  })}
                </ul>
                {filtered.length > shown.length && (
                  <div className={styles.more}>
                    <p className={ui.muted}>Showing {shown.length} of {filtered.length}</p>
                    <button type="button" className={styles.ghost} onClick={() => setLimit((l) => l + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, filtered.length - shown.length)} more</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={sheet && !desktop}
        onClose={() => setSheet(false)}
        title="Filters"
        labelId="filters-title"
        sheet
        footer={
          <>
            <button type="button" className={styles.ghost} onClick={() => setDraft(clearFilters(draft))}>Reset</button>
            <button type="button" className={styles.primary} onClick={() => { update(draft); setSheet(false); }}>Apply</button>
          </>
        }
      >
        {filterNode(draft, (patch) => setDraft((d) => ({ ...d, ...patch })))}
      </Modal>

      {dialog === "prices" && <PriceDialog open items={selectedItems} onClose={() => setDialog(null)} onApply={(percent) => applyBulk(() => api.bulkItems("price_percent", selectedIds, { percent }), (r) => `${r.affected} prices changed.`)} />}
      {dialog === "section" && <SectionDialog open sections={sections} onClose={() => setDialog(null)} onApply={(section) => applyBulk(() => api.bulkItems("move_section", selectedIds, { section }), (r) => `${r.affected} moved.`)} />}
      {dialog === "availability" && <AvailabilityDialog open onClose={() => setDialog(null)} onApply={(availability) => applyBulk(() => api.bulkItems("set_availability", selectedIds, { availability }), (r) => `${r.affected} updated.`)} />}
      {dialog === "import" && (
        <ImportDialog
          open
          premium={shop.planKey === "premium"}
          remaining={shop.itemsLimit ? Math.max(0, shop.itemsLimit - enriched.length) : 500}
          onClose={() => setDialog(null)}
          onImport={async (rows) => {
            const out = await api.importItems(rows);
            await refresh();
            setNotice({ tone: "ok", text: `${out.created} items imported as drafts.` });
            setDialog(null);
          }}
        />
      )}
      {editing !== undefined && (
        <ItemDialog
          key={editing?.id ?? "new"}
          open
          item={editing}
          onClose={() => setEditing(undefined)}
          onPhotosChanged={refresh}
          onSave={async (value, files = []) => {
            const id = await api.saveItem(editing?.id ?? null, value);
            const failed = [];
            for (const file of files) {
              try {
                await api.uploadItemPhoto(id, file);
              } catch (err) {
                failed.push(errorText(err));
                if (err?.code === "photo_limit") break;
              }
            }
            await refresh();
            const base = editing ? "Item saved." : "Item added as a draft.";
            setNotice(failed.length ? { tone: "error", text: `${base} ${files.length - failed.length} of ${files.length} photos uploaded. ${failed[0]} Open Edit to add the rest.` } : { tone: "ok", text: base });
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
}
