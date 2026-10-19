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
} from "@fortawesome/free-solid-svg-icons";
import Button from "../Button.jsx";
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
const PAGE_SIZES = [25, 50, 100];
const PAGE_JUMP = 10;

const stop = (event) => event.stopPropagation();

export default function DataTable({
  columns,
  queryKey,
  fetchPage,
  fetchAll,
  rowKey = "id",
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
  initialSearch = "",
  emptyText = "Nothing to show",
}) {
  const stored = useMemo(() => readStore(storageKey), [storageKey]);
  const uid = useId();
  const mobile = useMediaQuery("(max-width: 768px)");
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const headCheckRef = useRef(null);

  const [searchText, setSearchText] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);

  // Opened from a header search result: show that search, and follow it if the person searches again.
  useEffect(() => {
    setSearchText(initialSearch);
    setSearch(initialSearch);
    setPage(0);
  }, [initialSearch]);
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(stored.pageSize ?? 50);
  const defaultHidden = useMemo(() => columns.filter((column) => column.hiddenByDefault).map((column) => column.key), [columns]);
  const [hidden, setHidden] = useState(stored.hidden ?? defaultHidden);
  const [density, setDensity] = useState(stored.density ?? "comfortable");
  const [views, setViews] = useState(stored.views ?? []);
  const [selected, setSelected] = useState(() => new Map());
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

  const scrollMargin = mobile ? 0 : HEAD_HEIGHT;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (mobile ? 190 : ROW_HEIGHT[density]),
    getItemKey: (index) => (rows[index] ? rowId(rows[index]) : index),
    overscan: 8,
    gap: mobile ? 12 : 0,
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

  return (
    <section className={`dt ${mobile ? "dt--mobile" : ""} dt--${density}`} aria-busy={isFetching}>
      <div className="dt__bar">
        <label className="dt__search">
          <FontAwesomeIcon icon={faMagnifyingGlass} />
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
        {toolbar}
        <div className="dt__tools">
          {mobile && sortable.length ? (
            <div className="dt__sort-mobile">
              <select value={sort?.key} aria-label="Sort by" onChange={(event) => setSort({ key: event.target.value, dir: sort?.dir ?? "asc" })}>
                {sortable.map((column) => (
                  <option key={column.key} value={column.sortKey === true ? column.key : column.sortKey}>{column.label ?? column.header}</option>
                ))}
              </select>
              <Button size="sm" icon={faArrowDownWideShort} aria-label={`Sort ${sort?.dir === "desc" ? "descending" : "ascending"}`} onClick={() => setSort({ ...sort, dir: sort?.dir === "desc" ? "asc" : "desc" })} />
            </div>
          ) : null}
          <SavedViews views={views} onApply={applyView} onDelete={(id) => setViews((current) => current.filter((view) => view.id !== id))} onSave={saveView} />
          <ColumnChooser columns={columns} hidden={hidden} onToggle={toggleColumn} onReset={() => setHidden([])} />
          <Button size="sm" aria-pressed={density === "compact"} onClick={() => setDensity((current) => (current === "compact" ? "comfortable" : "compact"))}>
            {density === "compact" ? "Comfortable" : "Compact"}
          </Button>
          <Button size="sm" icon={faDownload} disabled={exporting || !total} onClick={exportCsv}>
            {exporting ? "Exporting" : "CSV"}
          </Button>
        </div>
      </div>

      {selected.size ? (
        <div className="dt__selection" role="status">
          <strong>{selected.size} selected</strong>
          {fetchAll && pageAll && selected.size < total ? (
            <button type="button" className="dt__link" onClick={selectMatching}>Select all {total}</button>
          ) : null}
          {renderBulk ? renderBulk({ rows: selectedRows, ids: selectedRows.map(rowId), clear: clearSelection }) : null}
          <button type="button" className="dt__link" onClick={clearSelection}>Clear</button>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="dt__scroll"
        role="grid"
        tabIndex={0}
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
                  <input ref={headCheckRef} type="checkbox" tabIndex={-1} checked={pageAll} onChange={togglePage} aria-label="Select all rows on this page" />
                </div>
              ) : null}
              {visible.map((column) => {
                const key = column.sortKey === true ? column.key : column.sortKey;
                const dir = key && sort?.key === key ? sort.dir : null;
                return (
                  <div
                    key={column.key}
                    className="dt__hcell"
                    role="columnheader"
                    aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined}
                    style={{ justifyContent: column.align === "end" ? "flex-end" : "flex-start" }}
                  >
                    {key ? (
                      <button type="button" tabIndex={-1} className="dt__sort" onClick={() => changeSort(key)}>
                        {column.header}
                        {dir ? <FontAwesomeIcon icon={dir === "asc" ? faChevronUp : faChevronDown} /> : null}
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
                <div key={index} className="dt__skeleton"><span className="skeleton" /></div>
              ))
            : null}

          <div className="dt__body" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              if (!row) return null;
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
                  style={{ transform: `translateY(${item.start - scrollMargin}px)`, gridTemplateColumns: mobile ? undefined : template }}
                  onClick={() => {
                    setActive(item.index);
                    onRowOpen?.(row);
                  }}
                >
                  {selectable ? (
                    <div className="dt__cell dt__cell--check" role="gridcell" onClick={stop}>
                      <input type="checkbox" tabIndex={-1} checked={isSelected} onChange={() => toggleRow(row)} aria-label="Select row" />
                    </div>
                  ) : null}
                  {visible.map((column) => (
                    <div
                      key={column.key}
                      className="dt__cell"
                      role="gridcell"
                      data-label={column.label ?? column.header}
                      style={{ justifyContent: !mobile && column.align === "end" ? "flex-end" : undefined }}
                    >
                      {column.render ? column.render(row) : column.accessor?.(row)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {!isLoading && !isError && !rows.length ? <p className="dt__state">{emptyText}</p> : null}
          {isError ? (
            <div className="dt__state" role="alert">
              <p>{error?.message ?? "Could not load rows"}</p>
              <Button size="sm" onClick={() => refetch()}>Retry</Button>
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
          <Button size="sm" icon={faChevronLeft} aria-label="Previous page" disabled={page === 0} onClick={() => setPage((value) => value - 1)} />
          <span>{page + 1} / {pageCount}</span>
          <Button size="sm" icon={faChevronRight} aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => setPage((value) => value + 1)} />
        </div>
      </div>
    </section>
  );
}
