import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDownWideShort,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faDownload,
  faMagnifyingGlass,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Button from "../Button.jsx";
import { BELOW_MD } from "../../lib/breakpoints.js";
import { useMediaQuery } from "../../lib/useMediaQuery.js";
import { todayEat } from "../../lib/time.js";
import ColumnChooser from "./ColumnChooser.jsx";
import SavedViews from "./SavedViews.jsx";
import { downloadCsv, toCsv } from "./csv.js";
import { readStore, writeStore } from "./storage.js";
import "./DataTable.css";

const HEAD_HEIGHT = 44;
const CHECK_WIDTH = 44;
const ROW_HEIGHT = { comfortable: 60, compact: 44 };
const CARD_HEIGHT = 132;
const CARD_GAP = 12;
const PAGE_SIZES = [25, 50, 100];
const PAGE_JUMP = 10;

const stop = (event) => event.stopPropagation();

function Check({ checked, onChange, label, inputRef, tabIndex }) {
  return (
    <label className="dt__checkbox">
      <input ref={inputRef} type="checkbox" tabIndex={tabIndex} checked={checked} onChange={onChange} aria-label={label} />
    </label>
  );
}

/**
 * Columns may carry `card: "title" | "status" | "metric"` to place them in the
 * phone card. Everything else goes into the card's expandable detail list.
 */
function splitCard(visible) {
  const title = visible.find((column) => column.card === "title") ?? visible[0];
  const status = visible.find((column) => column.card === "status");
  const metric = visible.find((column) => column.card === "metric");
  const details = visible.filter((column) => column !== title && column !== status && column !== metric);
  return { title, status, metric, details };
}

const cell = (column, row) => (column.render ? column.render(row) : column.accessor?.(row));

export default function DataTable({
  columns,
  queryKey,
  fetchPage,
  fetchAll,
  rowKey = "id",
  rowLabel,
  storageKey,
  defaultSort,
  extra,
  onExtraChange,
  selectable = false,
  renderBulk,
  toolbar,
  onRowOpen,
  exportName = "export",
  searchPlaceholder = "Search",
  emptyText = "Nothing to show",
}) {
  const stored = useMemo(() => readStore(storageKey), [storageKey]);
  const uid = useId();
  const mobile = useMediaQuery(BELOW_MD);
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const headCheckRef = useRef(null);
  const selectionRef = useRef(null);

  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(stored.pageSize ?? 50);
  const defaultHidden = useMemo(() => columns.filter((column) => column.hiddenByDefault).map((column) => column.key), [columns]);
  const [hidden, setHidden] = useState(stored.hidden ?? defaultHidden);
  const [density, setDensity] = useState(stored.density ?? "comfortable");
  const [views, setViews] = useState(stored.views ?? []);
  const [selected, setSelected] = useState(() => new Map());
  const [expanded, setExpanded] = useState(() => new Set());
  const [active, setActive] = useState(-1);
  const [exporting, setExporting] = useState(false);

  const extraKey = JSON.stringify(extra ?? null);
  const params = { search, sort, page, pageSize, extra };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [...queryKey, params],
    queryFn: () => fetchPage(params),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const visible = columns.filter((column) => column.locked || !hidden.includes(column.key));
  const rowId = (row) => row[rowKey];
  const labelOf = (row) => rowLabel?.(row) ?? "row";
  const hasSelection = selected.size > 0;
  const stickyBar = mobile && hasSelection;

  useEffect(() => {
    writeStore(storageKey, { pageSize, hidden, density, views });
  }, [storageKey, pageSize, hidden, density, views]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    setPage(0);
    setSelected(new Map());
  }, [extraKey]);

  useEffect(() => {
    setActive(-1);
  }, [page, pageSize, search, sort, extraKey]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("[role='dialog']") || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The sticky bulk bar publishes its height so the page, the list and the
  // toast stack can keep clear of it.
  useEffect(() => {
    const node = selectionRef.current;
    const root = document.documentElement;
    if (!stickyBar || !node) return undefined;
    const publish = () => root.style.setProperty("--admin-bulkbar-h", `${node.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--admin-bulkbar-h");
    };
  }, [stickyBar]);

  const scrollMargin = mobile ? 0 : HEAD_HEIGHT;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (mobile ? CARD_HEIGHT : ROW_HEIGHT[density]),
    getItemKey: (index) => (rows[index] ? rowId(rows[index]) : index),
    overscan: 8,
    gap: mobile ? CARD_GAP : 0,
    scrollMargin,
    scrollPaddingStart: scrollMargin,
  });

  const pageAll = rows.length > 0 && rows.every((row) => selected.has(rowId(row)));
  const pageSome = rows.some((row) => selected.has(rowId(row)));

  useEffect(() => {
    if (headCheckRef.current) headCheckRef.current.indeterminate = pageSome && !pageAll;
  }, [pageSome, pageAll]);

  const toggleRow = useCallback((row) => {
    setSelected((previous) => {
      const next = new Map(previous);
      const id = row[rowKey];
      if (next.has(id)) next.delete(id);
      else next.set(id, row);
      return next;
    });
  }, [rowKey]);

  const toggleExpanded = (id) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((previous) => {
      const next = new Map(previous);
      rows.forEach((row) => (pageAll ? next.delete(rowId(row)) : next.set(rowId(row), row)));
      return next;
    });
  };

  const selectMatching = async () => {
    const all = await fetchAll({ search, sort, extra });
    setSelected(new Map(all.map((row) => [rowId(row), row])));
  };

  const clearSelection = () => setSelected(new Map());

  const changeSort = (key) => {
    setSort((current) => (current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(0);
  };

  const toggleColumn = (key) => setHidden((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  const saveView = (name) => {
    const view = { id: `${Date.now()}`, name, state: { search, sort, pageSize, hidden, density, extra } };
    setViews((current) => [...current, view]);
  };

  const applyView = ({ state }) => {
    setSearchText(state.search ?? "");
    setSearch(state.search ?? "");
    setSort(state.sort ?? defaultSort);
    setPageSize(state.pageSize ?? 50);
    setHidden(state.hidden ?? defaultHidden);
    setDensity(state.density ?? "comfortable");
    setPage(0);
    onExtraChange?.(state.extra);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = fetchAll ? await fetchAll({ search, sort, extra }) : rows;
      downloadCsv(`${exportName}-${todayEat()}.csv`, toCsv(visible, all));
    } finally {
      setExporting(false);
    }
  };

  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget || !rows.length) return;
    const last = rows.length - 1;
    const move = (index) => {
      const next = Math.max(0, Math.min(last, index));
      setActive(next);
      virtualizer.scrollToIndex(next);
      event.preventDefault();
    };
    const row = rows[active];
    if (event.key === "ArrowDown") move(active + 1);
    else if (event.key === "ArrowUp") move(active < 0 ? 0 : active - 1);
    else if (event.key === "PageDown") move(active + PAGE_JUMP);
    else if (event.key === "PageUp") move(active - PAGE_JUMP);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(last);
    else if (event.key === " " && selectable && row) {
      toggleRow(row);
      event.preventDefault();
    } else if (event.key === "Enter" && onRowOpen && row) {
      onRowOpen(row);
      event.preventDefault();
    }
  };

  const template = `${selectable ? `${CHECK_WIDTH}px ` : ""}${visible.map((column) => `minmax(${column.min ?? 120}px, ${column.grow ?? 1}fr)`).join(" ")}`;
  const minWidth = (selectable ? CHECK_WIDTH : 0) + visible.reduce((sum, column) => sum + (column.min ?? 120), 0);
  const sortable = columns.filter((column) => column.sortKey);
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  const selectedRows = [...selected.values()];
  const card = splitCard(visible);
  const classes = ["dt", mobile && "dt--mobile", `dt--${density}`, hasSelection && "dt--selecting"].filter(Boolean).join(" ");

  const renderCard = (row, item) => {
    const id = rowId(row);
    const isSelected = selected.has(id);
    const isOpen = expanded.has(id);
    const detailId = `${uid}-d${item.index}`;
    const name = labelOf(row);
    return (
      <div
        key={item.key}
        ref={virtualizer.measureElement}
        data-index={item.index}
        id={`${uid}-r${item.index}`}
        role="row"
        aria-selected={selectable ? isSelected : undefined}
        className={["dt__row", "dt__card", item.index === active && "is-active", isSelected && "is-selected"].filter(Boolean).join(" ")}
        style={{ transform: `translateY(${item.start}px)` }}
        onClick={() => {
          setActive(item.index);
          onRowOpen?.(row);
        }}
      >
        <div className="dt__card-top">
          {selectable ? (
            <div className="dt__cell dt__cell--check" role="gridcell" onClick={stop}>
              <Check checked={isSelected} onChange={() => toggleRow(row)} label={`Select ${name}`} />
            </div>
          ) : null}
          <div className="dt__card-title" role="gridcell">{cell(card.title, row)}</div>
          {card.details.length ? (
            <div role="gridcell" onClick={stop}>
              <button
                type="button"
                className="dt__toggle"
                aria-expanded={isOpen}
                aria-controls={isOpen ? detailId : undefined}
                aria-label={`${isOpen ? "Hide" : "Show"} details for ${name}`}
                onClick={() => toggleExpanded(id)}
              >
                <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="admin-icon" />
              </button>
            </div>
          ) : null}
        </div>
        {card.status || card.metric ? (
          <div className="dt__card-meta">
            {card.status ? <div className="dt__card-status" role="gridcell">{cell(card.status, row)}</div> : null}
            {card.metric ? (
              <div className="dt__card-metric" role="gridcell">
                <span className="dt__card-label">{card.metric.label ?? card.metric.header}</span>
                {cell(card.metric, row)}
              </div>
            ) : null}
          </div>
        ) : null}
        {isOpen ? (
          <div id={detailId} role="gridcell" className="dt__card-details">
            <dl>
              {card.details.map((column) => (
                <div key={column.key} className="dt__detail">
                  <dt>{column.label ?? column.header}</dt>
                  <dd>{cell(column, row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    );
  };

  const renderTableRow = (row, item) => {
    const isSelected = selected.has(rowId(row));
    return (
      <div
        key={item.key}
        ref={virtualizer.measureElement}
        data-index={item.index}
        id={`${uid}-r${item.index}`}
        role="row"
        aria-selected={selectable ? isSelected : undefined}
        className={["dt__row", item.index === active && "is-active", isSelected && "is-selected", onRowOpen && "is-clickable"].filter(Boolean).join(" ")}
        style={{ transform: `translateY(${item.start - scrollMargin}px)`, gridTemplateColumns: template }}
        onClick={() => {
          setActive(item.index);
          onRowOpen?.(row);
        }}
      >
        {selectable ? (
          <div className="dt__cell dt__cell--check" role="gridcell" onClick={stop}>
            <Check tabIndex={-1} checked={isSelected} onChange={() => toggleRow(row)} label={`Select ${labelOf(row)}`} />
          </div>
        ) : null}
        {visible.map((column, index) => (
          <div
            key={column.key}
            className={["dt__cell", index === 0 && "dt__cell--first"].filter(Boolean).join(" ")}
            role="gridcell"
            style={{ justifyContent: column.align === "end" ? "flex-end" : "flex-start" }}
          >
            {cell(column, row)}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className={classes} aria-busy={isFetching} style={{ "--dt-check-w": selectable ? `${CHECK_WIDTH}px` : "0px" }}>
      <div className="dt__bar">
        <label className="dt__search">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="admin-icon" />
          <input
            ref={searchRef}
            type="search"
            value={searchText}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchText("");
                event.currentTarget.blur();
              }
            }}
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
        <div className="dt__tools">
          {toolbar}
          {mobile && sortable.length ? (
            <div className="dt__sort-mobile">
              <select value={sort?.key} aria-label="Sort by" onChange={(event) => setSort({ key: event.target.value, dir: sort?.dir ?? "asc" })}>
                {sortable.map((column) => (
                  <option key={column.key} value={column.sortKey === true ? column.key : column.sortKey}>{column.label ?? column.header}</option>
                ))}
              </select>
              <Button icon={faArrowDownWideShort} aria-label={`Sort ${sort?.dir === "desc" ? "descending" : "ascending"}`} onClick={() => setSort({ ...sort, dir: sort?.dir === "desc" ? "asc" : "desc" })} />
            </div>
          ) : null}
          <SavedViews views={views} onApply={applyView} onDelete={(id) => setViews((current) => current.filter((view) => view.id !== id))} onSave={saveView} />
          <ColumnChooser columns={columns} hidden={hidden} onToggle={toggleColumn} onReset={() => setHidden([])} />
          {mobile ? null : (
            <Button aria-pressed={density === "compact"} onClick={() => setDensity((current) => (current === "compact" ? "comfortable" : "compact"))}>
              {density === "compact" ? "Comfortable" : "Compact"}
            </Button>
          )}
          <Button icon={faDownload} disabled={exporting || !total} onClick={exportCsv}>
            {exporting ? "Exporting" : "CSV"}
          </Button>
        </div>
      </div>

      {hasSelection ? (
        <div ref={selectionRef} className="dt__selection" role="region" aria-label="Bulk actions">
          <div className="dt__selection-info">
            <Button icon={faXmark} className="admin-button--ghost" aria-label="Clear selection" onClick={clearSelection} />
            <strong role="status">{selected.size} selected</strong>
            {fetchAll && pageAll && selected.size < total ? (
              <button type="button" className="dt__link" onClick={selectMatching}>Select all {total}</button>
            ) : null}
          </div>
          {renderBulk ? renderBulk({ rows: selectedRows, ids: selectedRows.map(rowId), clear: clearSelection, compact: mobile }) : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="dt__scroll"
        role="grid"
        tabIndex={0}
        aria-label={searchPlaceholder}
        aria-rowcount={total}
        aria-multiselectable={selectable || undefined}
        aria-activedescendant={active >= 0 ? `${uid}-r${active}` : undefined}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.target === event.currentTarget && active < 0 && rows.length) setActive(0);
        }}
      >
        <div className="dt__inner" style={mobile ? undefined : { minWidth }}>
          {mobile ? null : (
            <div className="dt__head" role="row" style={{ gridTemplateColumns: template }}>
              {selectable ? (
                <div className="dt__hcell dt__hcell--check" role="columnheader">
                  <Check inputRef={headCheckRef} checked={pageAll} onChange={togglePage} label="Select all rows on this page" />
                </div>
              ) : null}
              {visible.map((column, index) => {
                const key = column.sortKey === true ? column.key : column.sortKey;
                const dir = key && sort?.key === key ? sort.dir : null;
                return (
                  <div
                    key={column.key}
                    className={["dt__hcell", index === 0 && "dt__hcell--first"].filter(Boolean).join(" ")}
                    role="columnheader"
                    aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    style={{ justifyContent: column.align === "end" ? "flex-end" : "flex-start" }}
                  >
                    {key ? (
                      <button type="button" className="dt__sort" onClick={() => changeSort(key)}>
                        {column.header}
                        {dir ? <FontAwesomeIcon icon={dir === "asc" ? faChevronUp : faChevronDown} className="admin-icon" /> : null}
                      </button>
                    ) : (
                      column.header
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isLoading
            ? Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="dt__skeleton"><span className="skeleton" role="status" aria-label="Loading" /></div>
              ))
            : null}

          <div className="dt__body" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
              return mobile ? renderCard(row, item) : renderTableRow(row, item);
            })}
          </div>

          {!isLoading && !isError && !rows.length ? <p className="dt__state">{emptyText}</p> : null}
          {isError ? (
            <div className="dt__state" role="alert">
              <p>{error?.message ?? "Could not load rows"}</p>
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dt__foot">
        <span>{total ? `${from}–${to} of ${total}` : "0 results"}</span>
        <div className="dt__pager">
          <select value={pageSize} aria-label="Rows per page" onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} per page</option>)}
          </select>
          <Button icon={faChevronLeft} aria-label="Previous page" disabled={page === 0} onClick={() => setPage((value) => value - 1)} />
          <span className="dt__page">{page + 1} / {pageCount}</span>
          <Button icon={faChevronRight} aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)} />
        </div>
      </div>
    </section>
  );
}
