import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BottomSheet, ProductCard } from "@epicmkt/ui";
import { DEFAULT_STALE_DAYS, activeChips, clearFilters, selectItems, sortItems, trackerView, writeCatalogView } from "@epicmkt/shared";
import * as api from "../api/index.js";
import { useSettings } from "../state/settings.js";
import Tip from "../onboarding/Tip.jsx";
import { useSession } from "../state/session.js";
import { listingState } from "../lib/listing.js";
import ViewAsFrame from "../components/ViewAsFrame.jsx";
import { useListings } from "./useListings.js";
import { useCatalogView } from "./useCatalogView.js";
import { cardLabels, toCardItem } from "./cardModel.js";
import Tracker from "./Tracker.jsx";
import Summary from "./Summary.jsx";
import Toolbar from "./Toolbar.jsx";
import Chips from "./Chips.jsx";
import FilterFields from "./FilterFields.jsx";
import SavedViews from "./SavedViews.jsx";
import ItemCard from "./ItemCard.jsx";
import BulkBar from "./BulkBar.jsx";
import { AvailabilityDialog, MoveDialog, PriceDialog } from "./BulkDialogs.jsx";
import ImportDialog from "./ImportDialog.jsx";
import Dialog from "./Dialog.jsx";
import { NoItems, NoResults } from "./Empty.jsx";
import styles from "./listings.module.css";

const PAGE = 60;
const UNDO_MS = 6000;
const BADGES = ["Popular", "New", "Best value"];
const NO_ITEMS = [];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function Listings() {
  const navigate = useNavigate();
  const me = useSession((s) => s.me);
  const refreshSession = useSession((s) => s.refresh);
  const { phase, items: all, stats, reload, setOrder } = useListings();
  const { view, setView, params, setParams, mode, setMode } = useCatalogView();
  const [selected, setSelected] = useState(() => new Set());
  const [shown, setShown] = useState(PAGE);
  const [dialog, setDialog] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState(view);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(NO_ITEMS);
  const pendingRef = useRef({ ids: NO_ITEMS, timer: null });
  const dragId = useRef(null);

  const business = me.business;
  const state = listingState(business);
  const shopLive = state === "live" || state === "grace";
  const plan = business.plan_key;
  const savedViews = me.settings?.saved_views ?? NO_ITEMS;

  const items = useMemo(() => (pending.length ? all.filter((i) => !pending.includes(i.id)) : all), [all, pending]);
  const reminderDays = useSettings((st) => st.settings.catalog.price_reminder_days);
  const ctx = useMemo(() => ({ now: Date.now(), staleDays: reminderDays ?? DEFAULT_STALE_DAYS }), [all, reminderDays]);
  const results = useMemo(() => selectItems(items, view, ctx), [items, view, ctx]);
  const filtersActive = activeChips(view).length > 0;
  const canReorder = view.sort === "manual" && !filtersActive;
  const paramKey = params.toString();

  useEffect(() => {
    setShown(PAGE);
  }, [paramKey]);

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const sections = useMemo(() => [...new Set(all.map((i) => i.section).filter(Boolean))].sort(), [all]);
  const types = useMemo(() => [...new Set(all.map((i) => i.kind).filter(Boolean))].sort(), [all]);
  const badges = useMemo(() => [...new Set([...BADGES, ...all.map((i) => i.badge).filter(Boolean)])], [all]);
  const bounds = useMemo(() => {
    const top = all.reduce((m, i) => Math.max(m, i.price ?? 0, i.priceMax ?? 0), 0);
    const max = Math.max(100, Math.ceil(top / 100) * 100);
    return { min: 0, max, step: Math.max(1, Math.round(max / 100)) };
  }, [all]);

  const say = useCallback((message, undo) => setNotice({ id: Date.now(), message, undo }), []);

  const flush = useCallback(async () => {
    const cur = pendingRef.current;
    if (!cur.ids.length) return;
    clearTimeout(cur.timer);
    pendingRef.current = { ids: NO_ITEMS, timer: null };
    setPending(NO_ITEMS);
    try {
      await api.bulkItems("delete", cur.ids);
    } finally {
      reload();
    }
  }, [reload]);

  useEffect(() => () => {
    const cur = pendingRef.current;
    if (cur.ids.length) {
      clearTimeout(cur.timer);
      api.bulkItems("delete", cur.ids).catch(() => {});
    }
  }, []);

  const run = useCallback(
    async (action, ids, args, doneText) => {
      setBusy(true);
      try {
        const res = await api.bulkItems(action, ids, args);
        await reload();
        setSelected(new Set());
        const skipped = res.skipped > 0 ? ` ${plural(res.skipped, "item was", "items were")} left as it was.` : "";
        say(`${doneText(res.changed)}${skipped}`);
        return res;
      } catch {
        say("That did not go through and nothing was changed. Try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [reload, say]
  );

  const startDelete = useCallback(
    async (ids) => {
      await flush();
      const timer = setTimeout(flush, UNDO_MS);
      pendingRef.current = { ids, timer };
      setPending(ids);
      setSelected(new Set());
      say(`${plural(ids.length, "item", "items")} deleted.`, () => {
        clearTimeout(pendingRef.current.timer);
        pendingRef.current = { ids: NO_ITEMS, timer: null };
        setPending(NO_ITEMS);
        say("Delete undone. Nothing was removed.");
      });
    },
    [flush, say]
  );

  const onBulk = useCallback(
    (name) => {
      const ids = [...selected];
      if (name === "hide") run("hide", ids, {}, (n) => `${plural(n, "item", "items")} hidden`);
      else if (name === "show") run("show", ids, {}, (n) => `${plural(n, "item", "items")} showing`);
      else if (name === "confirm_prices") run("confirm_prices", ids, {}, (n) => `Prices confirmed for ${plural(n, "item", "items")}`);
      else if (name === "delete") startDelete(ids);
      else setDialog(name);
    },
    [selected, run, startDelete]
  );

  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const move = useCallback(
    async (id, delta) => {
      const order = sortItems(items, "manual", ctx).map((i) => i.id);
      const at = order.indexOf(id);
      const to = at + delta;
      if (at < 0 || to < 0 || to >= order.length) return;
      order.splice(to, 0, order.splice(at, 1)[0]);
      setOrder(order);
      try {
        await api.reorderItems(order);
      } catch {
        say("Could not save the new order. Restored the old one.");
        reload();
      }
    },
    [items, ctx, setOrder, say, reload]
  );

  const drag = useMemo(
    () => ({
      start: (id) => {
        dragId.current = id;
      },
      drop: (targetId) => {
        const from = dragId.current;
        dragId.current = null;
        if (!from || from === targetId) return;
        const order = sortItems(items, "manual", ctx).map((i) => i.id);
        const at = order.indexOf(from);
        const to = order.indexOf(targetId);
        move(from, to - at);
      }
    }),
    [items, ctx, move]
  );

  const actions = useMemo(
    () => ({
      onEdit: (item) => navigate(`/catalog/items/${item.id}`),
      onDuplicate: async (item) => {
        try {
          await api.duplicateItem(item.id);
          await reload();
          say(`${item.name} duplicated as a hidden draft.`);
        } catch (e) {
          say(String(e?.code ?? "").startsWith("limit_reached") ? "You have reached your plan limit, so this item was not duplicated." : "Could not duplicate this item.");
        }
      },
      onToggle: (item) => run(item.visible && !item.draft ? "hide" : "show", [item.id], {}, () => (item.visible && !item.draft ? `${item.name} hidden` : `${item.name} showing`)),
      onConfirm: (item) => run("confirm_prices", [item.id], {}, () => `Price confirmed for ${item.name}`),
      onView: (item) => setDialog({ preview: item })
    }),
    [navigate, reload, run, say]
  );

  const saveViews = useCallback(
    async (next) => {
      await api.saveViews(next);
      await refreshSession();
    },
    [refreshSession]
  );

  const apply = (next) => setView(next, { replace: false });
  const clearAll = () => setView(clearFilters(view), { replace: false });
  const openSheet = () => {
    setDraft(view);
    setSheet(true);
  };

  useEffect(() => {
    if (!notice) return undefined;
    if (notice.undo) return undefined;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  const limit = stats?.items_limit ?? null;
  const canAdd = limit === null || (stats?.total ?? 0) < limit;
  const importLocked = plan !== "premium";

  if (phase === "loading") return <p className={styles.muted} role="status">Loading your items</p>;
  if (phase === "error") {
    return (
      <section className={styles.empty}>
        <h2>Could not load your items</h2>
        <button type="button" className={styles.primaryBtn} onClick={reload}>Try again</button>
      </section>
    );
  }

  const empty = (stats?.total ?? 0) === 0 && items.length === 0;
  const dialogName = typeof dialog === "string" ? dialog : null;
  const previewItem = dialog && typeof dialog === "object" ? dialog.preview : null;
  const visible = results.slice(0, shown);
  const order = canReorder ? visible.map((i) => i.id) : null;

  return (
    <div className={styles.page} data-mode={mode}>
      <header className={styles.head}>
        <h1>Catalog</h1>
      </header>
      <Tip id="catalog-price-reminder">We remind you to confirm prices on the schedule you chose in Settings. Confirm them here when they are still right.</Tip>
      {empty ? (
        <NoItems onImport={() => setDialog("import")} importLocked={importLocked} />
      ) : (
        <>
          <Summary items={items} shopLive={shopLive} state={state} />
          <Tracker stats={stats} view={view} onPick={apply} />
          <Toolbar
            view={view}
            onSearch={(q) => setView((v) => ({ ...v, q }))}
            onSort={(sort) => setView((v) => ({ ...v, sort }))}
            mode={mode}
            onMode={setMode}
            onOpenFilters={openSheet}
            onOpenViews={() => setDialog("views")}
            onOpenImport={() => setDialog("import")}
            importLocked={importLocked}
            canAdd={canAdd}
          />
          <Chips view={view} count={results.length} total={items.length} onChange={apply} onClear={clearAll} />
          <div className={styles.layout}>
            <aside className={styles.panel} aria-label="Filters">
              <FilterFields view={view} onChange={(next) => setView(next)} sections={sections} types={types} badges={badges} bounds={bounds} />
            </aside>
            <div className={styles.results}>
              <BulkBar count={selected.size} resultCount={results.length} onSelectAll={() => setSelected(new Set(results.map((i) => i.id)))} onClear={() => setSelected(new Set())} onAction={onBulk} busy={busy} />
              {results.length === 0 ? (
                <NoResults onClear={clearAll} />
              ) : (
                <>
                  <div className={styles.grid} data-mode={mode} role="list" aria-label="Your items">
                    {visible.map((item, index) => (
                      <div key={item.id} role="listitem" className={styles.gridCell}>
                        <ItemCard
                          item={item}
                          ctx={ctx}
                          layout={mode === "list" ? "row" : "card"}
                          selected={selected.has(item.id)}
                          onSelect={toggleSelect}
                          canReorder={canReorder}
                          onMove={move}
                          isFirst={order ? index === 0 : false}
                          isLast={order ? index === visible.length - 1 && visible.length === results.length : false}
                          drag={drag}
                          {...actions}
                        />
                      </div>
                    ))}
                  </div>
                  {results.length > shown && (
                    <div className={styles.more}>
                      <p className={styles.muted}>Showing {shown} of {results.length}</p>
                      <button type="button" className={styles.secondaryBtn} onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, results.length - shown)} more</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {notice && (
        <div className={styles.notice} role="status">
          <span>{notice.message}</span>
          {notice.undo && <button type="button" className={styles.linkBtn} onClick={() => { notice.undo(); }}>Undo</button>}
          <button type="button" className={styles.linkBtn} onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <BottomSheet open={sheet} onClose={() => setSheet(false)} labelledBy="filters-title" closeAbove="(min-width: 1024px)">
        <div className={styles.sheet}>
          <h2 id="filters-title">Filters</h2>
          <div className={styles.sheetBody}>
            <FilterFields view={draft} onChange={setDraft} sections={sections} types={types} badges={badges} bounds={bounds} />
          </div>
          <div className={styles.sheetFoot}>
            <button type="button" className={styles.secondaryBtn} onClick={() => setDraft(clearFilters(draft))}>Reset</button>
            <button type="button" className={styles.primaryBtn} onClick={() => { apply({ ...draft, q: view.q }); setSheet(false); }}>Apply</button>
          </div>
        </div>
      </BottomSheet>

      <Dialog open={dialogName === "views"} onClose={() => setDialog(null)} title="Saved views">
        <SavedViews views={savedViews} currentParams={writeCatalogView(view).toString()} onApply={(v) => { setParams(new URLSearchParams(v.params)); setDialog(null); }} onSave={saveViews} />
      </Dialog>
      <ImportDialog
        open={dialogName === "import"}
        onClose={() => setDialog(null)}
        plan={plan}
        stats={stats}
        onImported={async (n) => {
          setDialog(null);
          await reload();
          setView(trackerView("drafts"), { replace: false });
          say(`${plural(n, "item", "items")} imported as hidden drafts.`);
        }}
      />
      <MoveDialog open={dialogName === "move_section"} onClose={() => setDialog(null)} sections={sections} count={selected.size} onApply={(args) => { setDialog(null); run("move_section", [...selected], args, (n) => `${plural(n, "item", "items")} moved`); }} />
      <AvailabilityDialog open={dialogName === "set_availability"} onClose={() => setDialog(null)} count={selected.size} onApply={(args) => { setDialog(null); run("set_availability", [...selected], args, (n) => `Availability set for ${plural(n, "item", "items")}`); }} />
      <PriceDialog open={dialogName === "price_percent"} onClose={() => setDialog(null)} items={selectedItems} onApply={(args) => { setDialog(null); run("price_percent", [...selected], args, (n) => `Prices changed for ${plural(n, "item", "items")}`); }} />
      <Dialog open={Boolean(previewItem)} onClose={() => setDialog(null)} title="View as customer">
        {previewItem && (
          <ViewAsFrame device="mobile" notice="Preview only. This is how customers see this item.">
            <ProductCard item={toCardItem(previewItem)} labels={cardLabels(previewItem.availability)} mode="preview" />
          </ViewAsFrame>
        )}
      </Dialog>
    </div>
  );
}
