import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleDown, faAngleLeft, faAngleRight, faAngleUp, faMagnifyingGlass, faSliders, faSort, faSortDown, faSortUp, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Button } from "../Button.jsx";
import { EmptyState } from "../EmptyState.jsx";
import { Skeleton } from "../Skeleton.jsx";
import { useToast } from "../Toast.jsx";
import { cx } from "../cx.js";
import { useMediaQuery } from "../../hooks/useMediaQuery.js";
import { csvFilename, downloadText, toCsv } from "../../lib/csv.js";
import { loadPrefs, loadViews, savePrefs } from "../../lib/savedViews.js";
import { ColumnsMenu, ExportMenu, ViewsMenu } from "./Menus.jsx";
import { useVirtualRows } from "./useVirtualRows.js";
import styles from "./DataTable.module.css";

const ROW_HEIGHT = { comfortable: 60, compact: 40 };
const CARD_ESTIMATE = 168;
const DEFAULT_PAGE_SIZES = [25, 50, 100];
const SELECT_W = "2.75rem";
const isTyping = (el) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const interactive = (el) => el instanceof Element && Boolean(el.closest("a,button,input,select,textarea,label,[role=checkbox],[data-no-row-click]"));

/**
 * One table for every admin list. It owns how the table looks and behaves; the page owns the data and the query.
 *
 *   <DataTable
 *     id="applications"  label="Applications"  noun={{ singular: "application", plural: "applications" }}
 *     columns={[{ key, header, cell: (row) => node, sortKey?, width?, min?, align?, primary?, locked?, defaultHidden?,
 *                 sticky?, card?: false, csv?: (row) => value | false, chooser?: false, hideHeader?, actions? }]}
 *     rows={rowsOfThisPage}  total={everythingThatMatches}  getRowId={(row) => row.id}  getRowLabel={(row) => "Mara Fresh Mart"}
 *     loading={firstLoad}  fetching={refreshingInBackground}  error={Error | null}  onRetry={...}
 *     page pageSize pageSizes onPageChange onPageSizeChange        server pagination (page is 1-based)
 *     sort={{ key, dir }}  onSortChange={({ key, dir }) => ...}      server sorting; a column is sortable when it has sortKey
 *     search={{ value, onChange, placeholder }}                      "/" focuses it
 *     filters={node}  filtersCount={n}  selection={{ ids: Set, onChange }}  bulkActions={({ ids, clear }) => node}
 *     onRowClick  rowTone={(row) => "danger" | "warning" | undefined}  highlightIds={Set}
 *     onExportAll={async () => ({ rows, truncated })}               adds "Everything that matches" to Export
 *     views={{ state, onApply, pristine, scope }}                    saved views (state = what the page keeps in its URL)
 *     empty={{ title, description, action }}  emptyFiltered={{ ... }}  filtered={boolean}
 *   />
 *
 * What it does for you: only the rows near the screen are drawn (so 100 rows a page stay fast, and so would 10 000),
 * the header stays put, columns can be hidden, rows can be tight or roomy, views can be saved, CSV can be exported,
 * and under 640 px every row turns into a stacked card. Keyboard: "/" jumps to search, Escape clears it, Tab reaches
 * the sort buttons, checkboxes and anything inside a cell, and Shift-click on a checkbox selects a range.
 */
export function DataTable({
  id, label, noun = { singular: "row", plural: "rows" }, columns, rows, total, getRowId, getRowLabel,
  loading = false, fetching = false, error = null, onRetry,
  page = 1, pageSize = 50, pageSizes = DEFAULT_PAGE_SIZES, onPageChange, onPageSizeChange,
  sort, onSortChange, search, filters, selection, bulkActions, onRowClick, rowTone, highlightIds,
  onExportAll, views, empty, emptyFiltered, filtered = false, filtersCount = 0, height,
}) {
  const toast = useToast();
  const uid = useId();
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const lastToggled = useRef(null);
  const cards = useMediaQuery("(max-width: 640px)");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ---- columns and density: remembered per table in this browser --------------------------------------------------
  const [prefs, setPrefs] = useState(() => loadPrefs(id));
  const defaultKeys = useMemo(() => columns.filter((c) => !c.defaultHidden).map((c) => c.key), [columns]);
  const visibleKeys = useMemo(() => (prefs.columns ?? defaultKeys).filter((k) => columns.some((c) => c.key === k)), [prefs.columns, defaultKeys, columns]);
  const visible = useMemo(() => columns.filter((c) => c.locked || visibleKeys.includes(c.key)), [columns, visibleKeys]);
  const density = prefs.density ?? "comfortable";
  const remember = useCallback((next) => setPrefs((prev) => { const merged = { ...prev, ...next }; savePrefs(id, merged); return merged; }), [id]);

  // ---- saved views ----------------------------------------------------------------------------------------------
  const snapshot = () => ({ ...(views?.state ?? {}), columns: visibleKeys, density });
  const applyView = (state) => {
    const { columns: cols, density: dens, ...rest } = state ?? {};
    const next = {};
    if (Array.isArray(cols)) next.columns = cols;
    if (dens === "compact" || dens === "comfortable") next.density = dens;
    if (Object.keys(next).length) remember(next);
    views?.onApply?.(rest);
  };
  const appliedDefault = useRef(false);
  useEffect(() => {
    if (appliedDefault.current || !views?.pristine) return;
    appliedDefault.current = true;
    const data = loadViews(id, { scope: views.scope });
    const view = data.views.find((v) => v.id === data.defaultId);
    if (view) applyView(view.state);
    // runs once, on the first render where the page says nothing in the URL has been chosen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views?.pristine]);

  // ---- "/" focuses search; Escape in the box clears it, then leaves it ----------------------------------------------
  useEffect(() => {
    if (!search) return undefined;
    const onKey = (event) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [search]);

  // ---- selection ---------------------------------------------------------------------------------------------------
  const ids = selection?.ids ?? new Set();
  const rowIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const onPage = rowIds.filter((rid) => ids.has(rid)).length;
  const allOnPage = rows.length > 0 && onPage === rows.length;
  const commit = (next) => selection?.onChange?.(new Set(next));
  const toggleRow = (index, checked, shift) => {
    const next = new Set(ids);
    const from = shift && lastToggled.current != null ? Math.min(lastToggled.current, index) : index;
    const to = shift && lastToggled.current != null ? Math.max(lastToggled.current, index) : index;
    for (let i = from; i <= to; i += 1) { if (checked) next.add(rowIds[i]); else next.delete(rowIds[i]); }
    lastToggled.current = index;
    commit(next);
  };
  const togglePage = (checked) => { const next = new Set(ids); for (const rid of rowIds) { if (checked) next.add(rid); else next.delete(rid); } commit(next); };
  const clear = () => commit([]);

  // ---- virtual rows ------------------------------------------------------------------------------------------------
  const mode = cards ? "cards" : "table";
  const rowHeight = ROW_HEIGHT[density] ?? ROW_HEIGHT.comfortable;
  const keyOf = useCallback((i) => String(rowIds[i] ?? i), [rowIds]);
  const virtual = useVirtualRows({ count: rows.length, estimate: cards ? CARD_ESTIMATE : rowHeight, scrollRef, getKey: keyOf, resetKey: `${mode}:${density}` });
  const first = (page - 1) * pageSize;
  const jump = `${page}:${pageSize}:${sort?.key}:${sort?.dir}:${filtered}`;
  useEffect(() => { scrollRef.current?.scrollTo?.({ top: 0 }); }, [jump]);

  // ---- grid ---------------------------------------------------------------------------------------------------------
  const template = [selection ? SELECT_W : null, ...visible.map((c) => c.width ?? "minmax(8rem, 1fr)")].filter(Boolean).join(" ");
  const minWidth = (selection ? 44 : 0) + visible.reduce((sum, c) => sum + (c.min ?? 128), 0);
  const stickyLeft = {};
  let offset = selection ? 44 : 0;
  for (const c of visible) { if (c.sticky) { stickyLeft[c.key] = offset; } offset += c.min ?? 128; }
  const stickyStyle = (c) => (c.stickyEnd ? { right: 0 } : c.sticky && stickyLeft[c.key] != null ? { left: stickyLeft[c.key] } : undefined);

  const headerSort = (column) => {
    if (!column.sortKey || !onSortChange) return;
    const dir = sort?.key === column.sortKey && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key: column.sortKey, dir });
  };

  // ---- export -------------------------------------------------------------------------------------------------------
  const [exporting, setExporting] = useState(false);
  const csvColumns = columns.filter((c) => c.csv !== false && c.header).map((c) => ({ key: c.key, label: c.header, csv: typeof c.csv === "function" ? c.csv : undefined }));
  const download = (list) => downloadText(csvFilename(label ?? id), toCsv(csvColumns, list, { bom: true }));
  const exportPage = () => { download(rows); toast.success(`Exported ${rows.length} ${rows.length === 1 ? noun.singular : noun.plural}.`); };
  const exportAll = async () => {
    setExporting(true);
    try {
      const result = await onExportAll();
      download(result.rows);
      if (result.truncated) toast.warning(`Exported the first ${result.rows.length} of ${result.total}. Narrow the filters to export the rest.`);
      else toast.success(`Exported ${result.rows.length} ${result.rows.length === 1 ? noun.singular : noun.plural}.`);
    } catch (e) { toast.error(e.message || "Could not export."); } finally { setExporting(false); }
  };

  // ---- text ---------------------------------------------------------------------------------------------------------
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = rows.length ? first + 1 : 0;
  const to = first + rows.length;
  const summary = loading ? `Loading ${noun.plural}` : error ? `Could not load ${noun.plural}` : total === 0 ? `No ${noun.plural}` : `Showing ${from} to ${to} of ${total} ${total === 1 ? noun.singular : noun.plural}`;
  const emptyProps = filtered ? (emptyFiltered ?? { illustration: "search", title: `No ${noun.plural} match`, description: "Try a different search, or clear the filters." }) : (empty ?? { illustration: "inbox", title: `No ${noun.plural} yet` });
  const showSkeleton = loading && rows.length === 0;
  const showEmpty = !loading && !error && rows.length === 0;
  const showError = Boolean(error) && rows.length === 0;
  const shown = rows.slice(virtual.start, virtual.end);

  const renderCells = (row, index) => visible.map((c) => (
    <div key={c.key} role="cell" className={cx(styles.cell, c.align === "end" && styles.alignEnd, (c.sticky || c.stickyEnd) && styles.sticky, c.stickyEnd && styles.stickyEnd)} style={stickyStyle(c)} data-col={c.key}>
      {c.cell(row, { index, mode })}
    </div>
  ));

  return (
    <section className={styles.root} aria-label={label} data-density={density} data-mode={mode} style={height ? { "--dt-height": height } : undefined}>
      <div className={styles.toolbar}>
        {search ? (
          <div className={styles.search}>
            <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} fixedWidth aria-hidden="true" />
            <input
              ref={searchRef} type="search" className={styles.searchInput} value={search.value} placeholder={search.placeholder ?? `Search ${noun.plural}`}
              aria-label={search.label ?? `Search ${noun.plural}`} aria-keyshortcuts="/" autoComplete="off" spellCheck={false}
              onChange={(e) => search.onChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { if (search.value) { e.preventDefault(); search.onChange(""); } else e.currentTarget.blur(); } }}
            />
            {search.value ? (
              <button type="button" className={styles.clearSearch} aria-label="Clear search" onClick={() => { search.onChange(""); searchRef.current?.focus(); }}><FontAwesomeIcon icon={faXmark} fixedWidth /></button>
            ) : <kbd className={styles.kbd} aria-hidden="true">/</kbd>}
          </div>
        ) : <span />}
        <div className={styles.tools}>
          {views ? <ViewsMenu tableId={id} scope={views.scope} snapshot={snapshot} onApply={applyView} notify={(m) => toast.success(m)} /> : null}
          <ColumnsMenu columns={columns} visibleKeys={visibleKeys} onChange={(keys) => remember({ columns: keys })} onReset={() => remember({ columns: undefined })} />
          <div className={styles.density} role="group" aria-label="Row density">
            {["comfortable", "compact"].map((d) => (
              <button key={d} type="button" className={styles.densityButton} aria-pressed={density === d} onClick={() => remember({ density: d })}>{d === "comfortable" ? "Roomy" : "Tight"}</button>
            ))}
          </div>
          <ExportMenu pageCount={rows.length} total={total} onExportPage={exportPage} onExportAll={onExportAll ? exportAll : undefined} busy={exporting} />
        </div>
      </div>

      {filters && cards ? (
        <button type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls={`${uid}-filters`} onClick={() => setFiltersOpen((v) => !v)}>
          <FontAwesomeIcon icon={faSliders} fixedWidth aria-hidden="true" />
          <span>Filters and sort{filtersCount > 0 ? ` (${filtersCount} on)` : ""}</span>
          <FontAwesomeIcon icon={filtersOpen ? faAngleUp : faAngleDown} fixedWidth aria-hidden="true" className={styles.filterChevron} />
        </button>
      ) : null}
      {filters ? <div id={`${uid}-filters`} className={styles.filters} hidden={cards && !filtersOpen}>{filters}</div> : null}

      {selection && ids.size > 0 ? (
        <div className={styles.bulk} role="region" aria-label="Selected rows">
          <span className={styles.bulkCount}>{ids.size} selected</span>
          <div className={styles.bulkActions}>{bulkActions?.({ ids: [...ids], clear })}</div>
          <Button size="sm" variant="ghost" onClick={clear}>Clear selection</Button>
        </div>
      ) : null}

      <div className={styles.frame} aria-busy={loading || fetching || undefined} data-fetching={fetching && !loading ? "" : undefined}>
        <div
          ref={scrollRef} className={styles.scroller} tabIndex={0} aria-label={`${label ?? "Table"}, scrollable`}
          role={cards ? "list" : "table"} aria-rowcount={cards ? undefined : rows.length + 1} aria-colcount={cards ? undefined : visible.length + (selection ? 1 : 0)}
          style={cards ? undefined : { "--cols": template, "--min-w": `${minWidth}px`, "--row-h": `${rowHeight}px` }}
        >
          {!cards ? (
            <div role="rowgroup" className={styles.headGroup}>
              <div role="row" aria-rowindex={1} className={cx(styles.row, styles.head)}>
                {selection ? (
                  <div role="columnheader" className={cx(styles.cell, styles.selectCell, styles.sticky)} style={{ left: 0 }}>
                    <input type="checkbox" className={styles.checkbox} aria-label={`Select all ${rows.length} ${noun.plural} on this page`} checked={allOnPage} disabled={rows.length === 0}
                      ref={(el) => { if (el) el.indeterminate = onPage > 0 && !allOnPage; }} onChange={(e) => togglePage(e.target.checked)} />
                  </div>
                ) : null}
                {visible.map((c) => {
                  const active = sort?.key === c.sortKey;
                  return (
                    <div key={c.key} role="columnheader" className={cx(styles.cell, c.align === "end" && styles.alignEnd, (c.sticky || c.stickyEnd) && styles.sticky, c.stickyEnd && styles.stickyEnd)} style={stickyStyle(c)}
                      aria-sort={c.sortKey ? (active ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}>
                      {c.sortKey && onSortChange ? (
                        <button type="button" className={styles.sortButton} onClick={() => headerSort(c)} aria-label={`${c.header}, sort ${active && sort.dir === "asc" ? "descending" : "ascending"}`}>
                          <span>{c.header}</span>
                          <FontAwesomeIcon icon={active ? (sort.dir === "asc" ? faSortUp : faSortDown) : faSort} fixedWidth className={active ? styles.sortOn : styles.sortOff} aria-hidden="true" />
                        </button>
                      ) : <span className={c.hideHeader ? "sr-only" : undefined}>{c.header}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showSkeleton ? (
            <div role={cards ? undefined : "rowgroup"} className={styles.skeletons} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => <div key={i} className={styles.skeletonRow}><Skeleton variant="rect" height="1.1rem" /><Skeleton variant="rect" height="0.9rem" width="55%" /></div>)}
            </div>
          ) : null}

          {!showSkeleton && rows.length > 0 ? (
            <div ref={virtual.contentRef} role={cards ? undefined : "rowgroup"} className={styles.body} style={{ paddingTop: virtual.padTop, paddingBottom: virtual.padBottom }}>
              {shown.map((row, offsetIndex) => {
                const index = virtual.start + offsetIndex;
                const rid = rowIds[index];
                const selected = ids.has(rid);
                const tone = rowTone?.(row);
                const rowProps = {
                  "data-vkey": String(rid), "data-tone": tone, "data-selected": selected || undefined, "data-new": highlightIds?.has(rid) || undefined,
                  onClick: onRowClick ? (e) => { if (!interactive(e.target)) onRowClick(row); } : undefined,
                };
                const checkbox = selection ? (
                  <input type="checkbox" className={styles.checkbox} checked={selected} aria-label={`Select ${getRowLabel?.(row) ?? `row ${first + index + 1}`}`}
                    onChange={() => {}} onClick={(e) => toggleRow(index, e.currentTarget.checked, e.shiftKey)} />
                ) : null;

                if (cards) {
                  const primary = visible.find((c) => c.primary) ?? visible[0];
                  const rest = visible.filter((c) => c !== primary && c.card !== false);
                  return (
                    <div key={rid} role="listitem" className={cx(styles.cardWrap)}>
                      <article className={cx(styles.card, onRowClick && styles.clickable)} {...rowProps} aria-label={getRowLabel?.(row)}>
                        <div className={styles.cardHead}>{checkbox}<div className={styles.cardTitle}>{primary.cell(row, { index, mode })}</div></div>
                        <dl className={styles.cardBody}>
                          {rest.map((c) => (
                            <div key={c.key} className={cx(styles.cardField, c.actions && styles.cardActions)}>
                              {c.header && !c.actions ? <dt>{c.header}</dt> : null}
                              <dd>{c.cell(row, { index, mode })}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    </div>
                  );
                }
                return (
                  <div key={rid} role="row" aria-rowindex={index + 2} aria-selected={selection ? selected : undefined} className={cx(styles.row, styles.dataRow, onRowClick && styles.clickable)} {...rowProps}>
                    {selection ? <div role="cell" className={cx(styles.cell, styles.selectCell, styles.sticky)} style={{ left: 0 }}>{checkbox}</div> : null}
                    {renderCells(row, index)}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {showEmpty ? <div className={styles.overlay}><EmptyState {...emptyProps} /></div> : null}
        {showError ? (
          <div className={styles.overlay}>
            <EmptyState illustration="error" title={`The ${noun.plural} did not load`} description={error.message || "Check your connection, then try again."} action={onRetry ? <Button variant="primary" onClick={onRetry}>Try again</Button> : null} />
          </div>
        ) : null}
      </div>

      {error && rows.length > 0 ? <p className={styles.staleNote} role="status">Could not refresh. These {noun.plural} may be out of date. {onRetry ? <button type="button" className={styles.linkButton} onClick={onRetry}>Try again</button> : null}</p> : null}

      <footer className={styles.pager}>
        <p className={styles.summary} aria-hidden="true">{summary}</p>
        <p className="sr-only" role="status" aria-live="polite" id={`${uid}-live`}>{summary}</p>
        <div className={styles.pagerControls}>
          <label className={styles.sizeLabel}>
            <span>Rows per page</span>
            <select className={styles.select} value={pageSize} onChange={(e) => onPageSizeChange?.(Number(e.target.value))}>
              {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <nav className={styles.pageNav} aria-label={`${label ?? "Table"} pages`}>
            <button type="button" className={styles.pageButton} aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => onPageChange?.(page - 1)}><FontAwesomeIcon icon={faAngleLeft} fixedWidth /></button>
            <span className={styles.pageText} aria-current="page">Page {Math.min(page, pages)} of {pages}</span>
            <button type="button" className={styles.pageButton} aria-label="Next page" disabled={page >= pages || loading} onClick={() => onPageChange?.(page + 1)}><FontAwesomeIcon icon={faAngleRight} fixedWidth /></button>
          </nav>
        </div>
      </footer>
    </section>
  );
}
