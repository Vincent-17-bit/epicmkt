import { Fragment, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faXmark,
  faCircleXmark,
  faClockRotateLeft,
  faTableCells,
  faStore,
  faArrowUpLong,
  faArrowRight,
  faArrowTrendUp
} from "@fortawesome/free-solid-svg-icons";
import { resizeImageUrl } from "@epicmkt/shared";
import { getCategories, items, logSearch } from "../api/index.js";
import { trendLabel, trendPath, useTrending } from "../hooks/useTrending.js";
import { addRecent, clearRecent, getRecent, normalizeTerm, removeRecent } from "../lib/recentSearches.js";
import { matchCategories, suggestKey } from "../lib/suggest.js";
import { Container, IconButton, Skeleton } from "@epicmkt/ui";
import TrendingList from "./TrendingList.jsx";
import styles from "./SearchPanel.module.css";

export const SEARCH_ID = "site-search";

// Type-ahead, the way shoppers expect it (Baymard's autocomplete findings, Amazon, Jumia):
//   * suggestions start at 2 letters and come from the database dictionary (search_suggest, a few ms) or, failing that, the
//     product list; a short pause (DEBOUNCE_MS) keeps typing smooth and the previous answer stays up while the next loads;
//   * at most 8 phrase suggestions, then up to 4 products with a picture and price, stores and categories: each kind leads
//     straight to its own page (product, store, category);
//   * the part the shopper has NOT typed is bold, so the eye goes to the completion;
//   * arrow keys move through every row; on a phrase they copy it into the box (to edit it) and Escape puts back what was typed;
//     the arrow button beside a phrase does the same with a tap;
//   * a misspelling is corrected ("mlik" -> showing "milk") instead of showing nothing.
const DEBOUNCE_MS = 120;
const fmt = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const price = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? `KES ${fmt.format(Number(n))}` : null);
const thumb = (url) => (url ? resizeImageUrl(url, 96) : null);

// "mi" in "milk powder": typed part plain, completion bold. A match inside the text ("omo milk") marks the typed part instead.
function Marked({ text, typed }) {
  const q = suggestKey(typed);
  const lower = String(text).toLowerCase();
  if (!q) return text;
  if (lower.startsWith(q)) {
    return (
      <>
        <span className={styles.typed}>{text.slice(0, q.length)}</span>
        <b className={styles.completion}>{text.slice(q.length)}</b>
      </>
    );
  }
  const at = lower.indexOf(q);
  if (at < 0) return <b className={styles.completion}>{text}</b>;
  return (
    <>
      <b className={styles.completion}>{text.slice(0, at)}</b>
      <span className={styles.typed}>{text.slice(at, at + q.length)}</span>
      <b className={styles.completion}>{text.slice(at + q.length)}</b>
    </>
  );
}

function Thumb({ src, icon }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.thumb} aria-hidden="true">
      {src && !broken ? <img src={src} alt="" width="40" height="40" loading="lazy" decoding="async" onError={() => setBroken(true)} /> : <FontAwesomeIcon icon={icon} />}
    </span>
  );
}

function Rows({ count }) {
  return Array.from({ length: count }, (_, i) => (
    <li key={i} aria-hidden="true" className={styles.skeletonRow}>
      <Skeleton height="36px" radius="10px" />
    </li>
  ));
}

export default function SearchPanel({ open, onClose, onSelect, panelRef, inputRef }) {
  const listId = useId();
  const [term, setTerm] = useState("");
  const [typed, setTyped] = useState("");
  const [active, setActive] = useState(-1);
  // What Enter searches: products (results with filters) or stores. Remembered for the visit.
  const [scope, setScope] = useState(() => {
    try {
      return sessionStorage.getItem("epicmkt-search-scope") === "businesses" ? "businesses" : "products";
    } catch {
      return "products";
    }
  });
  const pickScope = (next) => {
    setScope(next);
    try {
      sessionStorage.setItem("epicmkt-search-scope", next);
    } catch {
      /* private mode: the choice lasts until the panel closes */
    }
    inputRef.current?.focus();
  };
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState(getRecent);
  const normalized = normalizeTerm(typed);
  const key = suggestKey(normalized);
  const typing = key.length >= 2;

  useEffect(() => {
    const id = setTimeout(() => setDebounced(key), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [key]);

  useEffect(() => {
    if (open) setRecent(getRecent());
    else {
      setTerm("");
      setTyped("");
      setActive(-1);
    }
  }, [open]);

  // Popular this week and rising now, every kind of search in one ranking (migration 0146). Paused while the shopper is typing.
  const { query: trending, list: trend, real, filler, alsoRising } = useTrending({ enabled: open, refetch: !typing });

  const suggestions = useQuery({
    queryKey: ["suggest", debounced],
    queryFn: () => items.suggest(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 5 * 60_000,
    // While the next answer loads, the last one stays (filtered to what is typed now), so the list never blinks.
    placeholderData: keepPreviousData
  });
  const categories = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 60_000, enabled: open });

  // A word the shopper typed or picked from suggestions is a search and is counted. A tap on a
  // trending row is not: counting it would make the list vote for itself. `to` sends a trending store straight to its page.
  const commit = (value, { fromTrending = false, to = null } = {}) => {
    const clean = normalizeTerm(value);
    if (!clean) return;
    addRecent(clean);
    if (!fromTrending) logSearch(clean);
    onSelect(to ?? (scope === "products" ? `/products?q=${encodeURIComponent(clean)}` : `/search?q=${encodeURIComponent(clean)}`));
  };

  // Every row in one list for the arrow keys: phrases, products, stores, categories, then "see all results".
  const groups = (() => {
    if (!typing) return [];
    const data = suggestions.data ?? {};
    const fits = (label) => {
      const k = suggestKey(label);
      return k.startsWith(key) || ` ${k}`.includes(` ${key}`) || Boolean(data.corrected);
    };
    const terms = (data.terms ?? []).filter((t) => fits(t.label)).slice(0, 8);
    const products = (data.products ?? []).filter((p) => p?.id && p?.slug).slice(0, 4);
    const stores = (data.stores ?? []).slice(0, 4);
    const cats = [...(data.categories ?? [])];
    for (const c of matchCategories(categories.data, key)) if (!cats.some((x) => x.id === c.id)) cats.push(c);
    return [
      { key: "terms", title: null, rows: terms.map((t) => ({ kind: "term", id: `t-${t.label}`, label: t.label, go: () => commit(t.label) })) },
      {
        key: "products",
        title: "Products",
        rows: products.map((p) => ({ kind: "product", id: `p-${p.id}`, label: p.name, image: thumb(p.image), price: price(p.price), go: () => onSelect(`/b/${p.slug}/i/${encodeURIComponent(p.id)}`) }))
      },
      { key: "stores", title: "Stores", rows: stores.map((s) => ({ kind: "store", id: `s-${s.slug}`, label: s.label, go: () => onSelect(`/b/${s.slug}`) })) },
      { key: "categories", title: "Categories", rows: cats.slice(0, 3).map((c) => ({ kind: "category", id: `c-${c.id}`, label: c.label, go: () => onSelect(`/c/${c.id}`) })) },
      // A corrected misspelling searches the correction ("mlik" -> all products for "milk").
      { key: "all", title: null, rows: [{ kind: "all", id: "all", label: data.corrected ?? normalized, go: () => commit(data.corrected ?? normalized) }] }
    ].filter((g) => g.rows.length);
  })();
  const flat = groups.flatMap((g) => g.rows);
  const settled = typing && debounced === key && !suggestions.isFetching;
  const loading = typing && !suggestions.data && !suggestions.isError;
  const nothing = settled && flat.length === 1;
  const corrected = typing ? suggestions.data?.corrected ?? null : null;

  const optionId = (row) => `${listId}-${row.id}`.replace(/[^a-zA-Z0-9_:-]/g, "_");
  const move = (to) => {
    const next = to < -1 ? flat.length - 1 : to >= flat.length ? -1 : to;
    setActive(next);
    const row = flat[next];
    // A phrase is copied into the box, so the shopper can edit it; anything else leaves the box as typed.
    setTerm(row?.kind === "term" ? row.label : typed);
    if (row) document.getElementById(optionId(row))?.scrollIntoView?.({ block: "nearest" });
  };

  const onKeyDown = (event) => {
    if (!typing || !flat.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(active - 1);
    } else if (event.key === "Escape" && active >= 0) {
      event.preventDefault();
      event.stopPropagation();
      setActive(-1);
      setTerm(typed);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      flat[active].go();
    }
  };

  const change = (value) => {
    setTerm(value);
    setTyped(value);
    setActive(-1);
  };
  const fill = (label) => {
    change(`${label} `);
    inputRef.current?.focus();
  };
  const submit = (event) => {
    event.preventDefault();
    commit(term);
  };
  const clear = () => {
    change("");
    inputRef.current?.focus();
  };

  const suggestTo = `/contact?suggest=${encodeURIComponent(normalized)}`;

  return (
    <>
      <button type="button" tabIndex={-1} aria-hidden="true" data-open={open} className={styles.scrim} onClick={onClose} />
      <div
        id={SEARCH_ID}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        data-open={open}
        inert={open ? undefined : ""}
        aria-hidden={open ? undefined : true}
        className={styles.panel}
      >
        <Container className={styles.inner}>
          <form role="search" className={styles.bar} onSubmit={submit}>
            <div className={styles.search}>
              <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.lens} aria-hidden="true" />
              <label htmlFor="search-input" className="sr-only">
                {scope === "products" ? "Search products, stores and categories" : "Search stores"}
              </label>
              <input
                id="search-input"
                ref={inputRef}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={typing && flat.length > 0}
                aria-controls={listId}
                aria-activedescendant={active >= 0 && flat[active] ? optionId(flat[active]) : undefined}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={scope === "products" ? "Search products, stores, categories…" : "Search stores and services…"}
                value={term}
                onChange={(event) => change(event.target.value)}
                onKeyDown={onKeyDown}
                className={styles.input}
              />
              {term && <IconButton icon={faCircleXmark} label="Clear search" onClick={clear} className={styles.clear} />}
              <button type="submit" className={styles.go}>
                Search
              </button>
            </div>
            <button type="button" className={styles.cancel} onClick={onClose}>
              <span className={styles.cancelText}>Cancel</span>
              <FontAwesomeIcon icon={faXmark} className={styles.cancelIcon} aria-hidden="true" />
              <span className="sr-only">Close search</span>
            </button>
          </form>
          <div className={styles.scope} role="radiogroup" aria-label="Search in">
            {[["products", "Products"], ["businesses", "Stores"]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={scope === id} className={styles.scopeBtn} onClick={() => pickScope(id)}>
                {label}
              </button>
            ))}
          </div>

          {typing ? (
            <div className={styles.results}>
              {corrected && (
                <p className={styles.corrected} role="status">
                  Showing results for <b>{corrected}</b>
                </p>
              )}
              {loading ? (
                <ul className={styles.list}>
                  <Rows count={4} />
                </ul>
              ) : (
                <ul id={listId} role="listbox" aria-label="Suggestions" className={styles.list} data-stale={(suggestions.isFetching && debounced !== key) || undefined}>
                  {groups.map((group) => (
                    <Fragment key={group.key}>
                      {group.title && (
                        <li role="presentation" className={styles.groupTitle}>
                          {group.title}
                        </li>
                      )}
                      {group.rows.map((row) => {
                        const index = flat.indexOf(row);
                        const on = index === active;
                        return (
                          <li
                            key={row.id}
                            id={optionId(row)}
                            role="option"
                            aria-selected={on}
                            data-kind={row.kind}
                            className={styles.row}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={row.go}
                            onMouseMove={() => active !== index && setActive(index)}
                          >
                            {row.kind === "term" && (
                              <>
                                <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.rowIcon} aria-hidden="true" />
                                <span className={styles.rowLabel}>
                                  <Marked text={row.label} typed={corrected ?? normalized} />
                                </span>
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className={styles.fill}
                                  aria-label={`Edit “${row.label}”`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    fill(row.label);
                                  }}
                                >
                                  <FontAwesomeIcon icon={faArrowUpLong} className={styles.fillIcon} aria-hidden="true" />
                                </button>
                              </>
                            )}
                            {row.kind === "product" && (
                              <>
                                <Thumb src={row.image} icon={faMagnifyingGlass} />
                                <span className={`${styles.rowLabel} ${styles.rowStack}`}>
                                  <span className={styles.clamp}>{row.label}</span>
                                  {row.price && <span className={styles.price}>{row.price}</span>}
                                </span>
                              </>
                            )}
                            {(row.kind === "store" || row.kind === "category") && (
                              <>
                                <span className={styles.badgeIcon} data-kind={row.kind} aria-hidden="true">
                                  <FontAwesomeIcon icon={row.kind === "store" ? faStore : faTableCells} />
                                </span>
                                <span className={styles.rowLabel}>{row.label}</span>
                              </>
                            )}
                            {row.kind === "all" && (
                              <>
                                <FontAwesomeIcon icon={faArrowRight} className={styles.rowIcon} aria-hidden="true" />
                                <span className={styles.rowLabel}>
                                  See all {scope === "products" ? "products" : "stores"} for <b>“{row.label}”</b>
                                </span>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </Fragment>
                  ))}
                </ul>
              )}
              {nothing && (
                <div className={styles.empty}>
                  <p>
                    No suggestions for “{normalized}”. Press Search to look through every product, or{" "}
                    <Link
                      to={suggestTo}
                      className={styles.suggest}
                      onClick={(event) => {
                        event.preventDefault();
                        onSelect(suggestTo);
                      }}
                    >
                      suggest a business
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.idle}>
              {recent.length > 0 && (
                <section aria-labelledby="search-recent">
                  <div className={styles.head}>
                    <h2 id="search-recent" className={styles.label}>
                      Recent
                    </h2>
                    <button type="button" className={styles.clearAll} onClick={() => setRecent(clearRecent())}>
                      Clear
                    </button>
                  </div>
                  <ul className={styles.chips}>
                    {recent.map((item) => (
                      <li key={item} className={styles.chip}>
                        <button type="button" className={styles.chipBtn} onClick={() => commit(item)}>
                          <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                          {item}
                        </button>
                        <IconButton icon={faXmark} label={`Remove ${item}`} className={styles.chipX} onClick={() => setRecent(removeRecent(item))} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(trending.isPending || trend.length > 0) && (
                <section aria-labelledby="search-top">
                  <div className={styles.head}>
                    <h2 id="search-top" className={styles.label}>
                      <FontAwesomeIcon icon={faArrowTrendUp} aria-hidden="true" /> Top searches
                    </h2>
                  </div>
                  <p className={styles.legend}>Most searched this week{real.some((item) => item.rising) || alsoRising.length > 0 ? <> · <span className={styles.legendRise}>↑ rising fast</span></> : null}</p>
                  {(trending.isPending || real.length > 0) && (
                    trending.isPending ? (
                      <ol className={styles.ranked}>
                        <Rows count={6} />
                      </ol>
                    ) : (
                      <TrendingList items={real} onPick={(item) => commit(item.term, { fromTrending: true, to: trendPath(item, null) })} />
                    )
                  )}
                  {!trending.isPending && alsoRising.length > 0 && (
                <>
                  <h3 className={styles.moreLabel}>Also rising fast</h3>
                  <TrendingList items={alsoRising} ranked={false} onPick={(item) => commit(item.term, { fromTrending: true, to: trendPath(item, null) })} />
                </>
              )}
              {!trending.isPending && filler.length > 0 && (
                    <>
                      <h3 className={styles.moreLabel}>Popular products</h3>
                      <TrendingList items={filler} ranked={false} onPick={(item) => commit(item.term, { fromTrending: true, to: trendPath(item, null) })} />
                    </>
                  )}
                </section>
              )}
            </div>
          )}
        </Container>
      </div>
    </>
  );
}
